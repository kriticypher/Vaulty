/**
 * InvoiceUploader.jsx - Reusable upload widget for Vaultly (Member 2).
 * Lets the user pick a PDF/JPG/JPEG/PNG file, shows the selected file name,
 * previews images before upload, and submits via the documented Base64 JSON
 * transfer format. Validation errors appear instantly with clear messages.
 */

import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  validateInvoiceFile,
  uploadInvoice,
  ocrExtract,
  formatFileSize,
  MAX_FILE_SIZE_BYTES
} from '../services/invoiceService';

export default function InvoiceUploader({ productId, productLabel, onUploaded, compact = false }) {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [validationError, setValidationError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(null); // { existing_invoice }
  const [ocrNote, setOcrNote] = useState('');
  const [metadata, setMetadata] = useState({
    invoice_number: '',
    seller: '',
    invoice_date: ''
  });
  // Tracks the latest selected file so a slow OCR pass can't fill the form
  // for a file the user has already replaced.
  const latestFileRef = useRef(null);
  // Keeps the OCR text of the selected file so the upload can store it.
  const lastOcrTextRef = useRef('');

  const clearFileState = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl('');
    setValidationError('');
  };

  const resetForm = () => {
    clearFileState();
    setMetadata({ invoice_number: '', seller: '', invoice_date: '' });
    setServerError('');
    setOcrNote('');
    latestFileRef.current = null;
    lastOcrTextRef.current = '';
  };

  const handleFileChange = (event) => {
    setServerError('');
    setSuccessMessage('');
    setDuplicateWarning(null);
    const file = event.target.files && event.target.files[0];
    if (!file) {
      clearFileState();
      return;
    }

    // Instant client-side validation (backend re-validates everything too)
    const error = validateInvoiceFile(file);
    if (error) {
      clearFileState();
      setValidationError(error);
      event.target.value = ''; // allow re-selecting the same invalid file
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setValidationError('');
    setOcrNote('');
    latestFileRef.current = file;
    lastOcrTextRef.current = ''; // cleared until the new file's OCR returns

    // Preview supported files: images inline, PDFs via the first page icon
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl('');
    }

    // Part: OCR — ask the backend to read the file's details in the
    // background and pre-fill the empty fields. Nothing is stored here;
    // the user reviews/edits everything before uploading.
    ocrExtract(file)
      .then((ocr) => {
        if (latestFileRef.current !== file) return; // stale result
        lastOcrTextRef.current = ocr.text || '';
        const detected = [];
        setMetadata((prev) => {
          const updates = { ...prev };
          if (ocr.invoice_number && !prev.invoice_number) {
            updates.invoice_number = ocr.invoice_number;
            detected.push('invoice number');
          }
          if (ocr.seller && !prev.seller) {
            updates.seller = ocr.seller;
            detected.push('seller');
          }
          if (ocr.invoice_date && !prev.invoice_date) {
            updates.invoice_date = ocr.invoice_date;
            detected.push('date');
          }
          return updates;
        });
        if (detected.length > 0) {
          setOcrNote(`🤖 Auto-filled ${detected.join(', ')} from the file (OCR — ${ocr.engine}). Please verify before uploading.`);
        } else if (ocr.error) {
          setOcrNote(`🤖 OCR could not read this file. ${ocr.error}`);
        } else {
          setOcrNote('🤖 OCR ran, but no invoice details were detected. Please fill the fields manually.');
        }
      })
      .catch(() => {
        if (latestFileRef.current !== file) return;
        setOcrNote('🤖 OCR preview failed. You can still fill the fields manually.');
      });
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setValidationError('Please choose a file to upload.');
      return;
    }

    setUploading(true);
    setServerError('');
    setSuccessMessage('');
    setDuplicateWarning(null);
    try {
      // force=true only arrives here after the user explicitly confirmed below
      const force = duplicateWarning ? true : false;
      const uploadMetadata = { ...metadata, ocr_text: lastOcrTextRef.current || '' };
      const result = await uploadInvoice(productId, uploadMetadata, selectedFile, force);
      setSuccessMessage(result.message || 'Invoice uploaded successfully.');
      resetForm();
      if (onUploaded) {
        onUploaded(result.invoice);
      }
    } catch (err) {
      if (err.status === 409 && err.data && err.data.duplicate) {
        // Backend flagged a duplicate (identical file, or same seller + number).
        setDuplicateWarning(err.data);
      } else {
        setServerError(err.message || 'Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSaveAnyway = () => {
    // Explicit user confirmation → retry the same upload with force=true
    handleUpload(new Event('submit'));
  };

  return (
    <div className="invoice-uploader">
      <form onSubmit={handleUpload}>
        {/* Dropzone: click or drag a file onto it */}
        <label
          className={`upload-dropzone ${validationError ? 'dropzone-error' : ''}`}
          htmlFor={`invoice-file-input-${productId}`}
        >
          <input
            id={`invoice-file-input-${productId}`}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {!selectedFile ? (
            <div className="dropzone-hint">
              <span className="dropzone-icon">📎</span>
              <strong>Click to choose a file</strong>
              <span>or drag it here — PDF, JPG, JPEG, PNG up to 5 MB</span>
            </div>
          ) : (
            <div className="file-chip">
              {previewUrl ? (
                <img src={previewUrl} alt="Selected invoice preview" className="file-chip-thumb" />
              ) : (
                <span className="file-chip-icon">📄</span>
              )}
              <div className="file-chip-text">
                <span className="file-chip-name">{selectedFile.name}</span>
                <span className="file-chip-size">
                  {formatFileSize(selectedFile.size)} • {selectedFile.type || 'Unknown type'}
                </span>
              </div>
              <span className="file-chip-replace">Change</span>
            </div>
          )}
        </label>

        {validationError && (
          <p className="upload-message upload-message-error">⚠️ {validationError}</p>
        )}

        {/* Optional metadata fields */}
        <div className={`upload-meta ${compact ? 'upload-meta-compact' : ''}`}>
          <div className="form-group">
            <label>Invoice Number (optional)</label>
            <input
              className="form-control"
              value={metadata.invoice_number}
              onChange={(e) => setMetadata({ ...metadata, invoice_number: e.target.value })}
              placeholder="e.g. INV-2026-001"
              disabled={uploading}
            />
          </div>
          <div className="form-group">
            <label>Seller / Store (optional)</label>
            <input
              className="form-control"
              value={metadata.seller}
              onChange={(e) => setMetadata({ ...metadata, seller: e.target.value })}
              placeholder="e.g. Amazon"
              disabled={uploading}
            />
          </div>
          <div className="form-group">
            <label>Invoice Date (optional)</label>
            <input
              className="form-control"
              type="date"
              value={metadata.invoice_date}
              onChange={(e) => setMetadata({ ...metadata, invoice_date: e.target.value })}
              disabled={uploading}
            />
          </div>
        </div>

        {/* OCR auto-fill note (Part: OCR) — shown after a file is analysed */}
        {ocrNote && (
          <p className="upload-note ocr-note">{ocrNote}</p>
        )}

        {productLabel && (
          <p className="upload-target">Uploading for: <strong>{productLabel}</strong></p>
        )}

        {duplicateWarning ? (
          /* Backend flagged seller + invoice number as already saved: the user
             must review the existing invoice or explicitly confirm. */
          <div className="duplicate-warning">
            <p className="duplicate-warning-title">⚠️ Possible duplicate invoice</p>
            <p className="duplicate-warning-text">{duplicateWarning.error}</p>
            {duplicateWarning.existing_invoice && (
              <div className="duplicate-existing">
                <span className="duplicate-existing-name">
                  {duplicateWarning.existing_invoice.original_filename || 'Existing invoice'}
                </span>
                <span className="duplicate-existing-sub">
                  {duplicateWarning.existing_invoice.seller || '—'}
                  {duplicateWarning.existing_invoice.invoice_number ? ` • ${duplicateWarning.existing_invoice.invoice_number}` : ''}
                  {duplicateWarning.existing_invoice.invoice_date ? ` • dated ${duplicateWarning.existing_invoice.invoice_date}` : ''}
                  {duplicateWarning.existing_invoice.uploaded_at ? ` • uploaded ${duplicateWarning.existing_invoice.uploaded_at}` : ''}
                </span>
              </div>
            )}
            <div className="duplicate-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(`/invoices/${duplicateWarning.existing_invoice.invoice_id}`)}
              >
                👁️ Review Existing
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveAnyway} disabled={uploading}>
                {uploading ? '⏳ Saving…' : '✅ Save Anyway (I confirm)'}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setDuplicateWarning(null)}>
                ✖ Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={uploading || !selectedFile}>
            {uploading ? '⏳ Uploading…' : '⬆️ Upload Invoice'}
          </button>
        )}

        {serverError && (
          <p className="upload-message upload-message-error">⚠️ {serverError}</p>
        )}
        {successMessage && (
          <p className="upload-message upload-message-success">✅ {successMessage}</p>
        )}
        <p className="upload-note">
          Files are scanned on the server: only genuine PDF/image content is stored, max{' '}
          {formatFileSize(MAX_FILE_SIZE_BYTES)}.
        </p>
      </form>
    </div>
  );
}
