-- CreateTable
CREATE TABLE "Users" (
    "user_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Sessions" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Products" (
    "product_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "price" REAL NOT NULL,
    "purchase_date" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Users" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "Warranties" (
    "warranty_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "start_date" TEXT NOT NULL,
    "duration_months" INTEGER NOT NULL,
    "expiry_date" TEXT NOT NULL,
    CONSTRAINT "Warranties_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Products" ("product_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Returns" (
    "return_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "return_deadline" TEXT NOT NULL,
    "return_status" TEXT NOT NULL DEFAULT 'Pending',
    CONSTRAINT "Returns_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Products" ("product_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceRecords" (
    "service_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "product_id" INTEGER NOT NULL,
    "service_date" TEXT NOT NULL,
    "service_center" TEXT,
    "cost" REAL,
    "description" TEXT,
    CONSTRAINT "ServiceRecords_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Products" ("product_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE INDEX "Sessions_user_id_idx" ON "Sessions"("user_id");

-- CreateIndex
CREATE INDEX "Products_user_id_idx" ON "Products"("user_id");

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

-- CreateIndex
CREATE INDEX "Warranties_product_id_idx" ON "Warranties"("product_id");

-- CreateIndex
CREATE INDEX "Returns_product_id_idx" ON "Returns"("product_id");

-- CreateIndex
CREATE INDEX "ServiceRecords_product_id_idx" ON "ServiceRecords"("product_id");

