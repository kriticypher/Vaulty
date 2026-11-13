/**
 * InvoiceUploader.jsx - Reusable upload widget for Vaultly (Member 2).
 * Lets the user pick a PDF/JPG/JPEG/PNG file, shows the selected file name,
 * previews images before upload, and submits via the documented Base64 JSON
 * transfer format. Validation errors appear instantly with clear messages.
 */

import React, { useState } from 'react';
import {
  validateInvoiceFile,
  uploadInvoice,
  formatFileSize,
  MAX_FILE_SIZE_BYTES
} from '../services/invoiceService';

export default function InvoiceUploader({ productId, productLabel, onUploaded, compact = false }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [validationError, setValidationError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [metadata, setMetadata] = useState({
    invoice_number: '',
    seller: '',
    invoice_date: ''
  });

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
  };

  const handleFileChange = (event) => {
    setServerError('');
    setSuccessMessage('');
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

    // Preview supported files: images inline, PDFs via the first page icon
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl('');
    }
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
    try {
      const result = await uploadInvoice(productId, metadata, selectedFile);
      setSuccessMessage(result.message || 'Invoice uploaded successfully.');
      resetForm();
      if (onUploaded) {
        onUploaded(result.invoice);
      }
    } catch (err) {
      setServerError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
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

        {productLabel && (
          <p className="upload-target">Uploading for: <strong>{productLabel}</strong></p>
        )}

        <button type="submit" className="btn btn-primary" disabled={uploading || !selectedFile}>
          {uploading ? '⏳ Uploading…' : '⬆️ Upload Invoice'}
        </button>

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
