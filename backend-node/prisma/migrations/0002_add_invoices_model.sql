-- CreateTable
CREATE TABLE "Invoices" (
    "invoice_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "invoice_number" TEXT,
    "seller" TEXT,
    "invoice_date" TEXT,
    "file_path" TEXT NOT NULL,
    "original_filename" TEXT,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ocr_text" TEXT,
    "ocr_processed" BOOLEAN NOT NULL DEFAULT false,
    "file_hash" TEXT,
    CONSTRAINT "Invoices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Products" ("product_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Invoices_product_id_idx" ON "Invoices"("product_id");

-- CreateIndex
CREATE INDEX "Invoices_invoice_number_idx" ON "Invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "Invoices_seller_idx" ON "Invoices"("seller");

-- CreateIndex
CREATE INDEX "Invoices_invoice_date_idx" ON "Invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "Invoices_file_hash_idx" ON "Invoices"("file_hash");

