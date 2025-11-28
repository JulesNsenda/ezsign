import { PDFDocument, rgb, degrees } from 'pdf-lib';

export interface PdfInfo {
  /** Number of pages in the PDF */
  pageCount: number;
  /** Page dimensions (width and height for each page) */
  pages: PageDimensions[];
  /** PDF title from metadata */
  title?: string;
  /** PDF author from metadata */
  author?: string;
  /** PDF creation date */
  creationDate?: Date;
}

export interface PageDimensions {
  /** Page number (0-indexed) */
  pageNumber: number;
  /** Page width in points */
  width: number;
  /** Page height in points */
  height: number;
}

export interface SignatureField {
  /** Page number (0-indexed) */
  page: number;
  /** X coordinate (from left) in points */
  x: number;
  /** Y coordinate (from bottom) in points */
  y: number;
  /** Width in points */
  width: number;
  /** Height in points */
  height: number;
  /** Signature image as base64 or Buffer */
  imageData: Buffer | string;
}

export interface TextField {
  /** Page number (0-indexed) */
  page: number;
  /** X coordinate (from left) in points */
  x: number;
  /** Y coordinate (from bottom) in points */
  y: number;
  /** Text content */
  text: string;
  /** Font size in points */
  fontSize?: number;
  /** Text color (default: black) */
  color?: { r: number; g: number; b: number };
}

export interface DateField extends TextField {
  /** Date format (default: ISO string) */
  format?: 'iso' | 'locale' | 'short';
}

export interface CheckboxField {
  /** Page number (0-indexed) */
  page: number;
  /** X coordinate (from left) in points */
  x: number;
  /** Y coordinate (from bottom) in points */
  y: number;
  /** Width in points */
  width: number;
  /** Height in points */
  height: number;
  /** Whether checkbox is checked */
  checked: boolean;
  /** Checkbox styling options */
  options?: {
    /** Border color as hex string (default: #000000) */
    borderColor?: string;
    /** Check mark color as hex string (default: #000000) */
    checkColor?: string;
    /** Background color as hex string (default: #FFFFFF) */
    backgroundColor?: string;
    /** Border width in points (default: 1) */
    borderWidth?: number;
    /** Style of check mark: 'x' for X mark, 'checkmark' for ✓ (default: 'x') */
    style?: 'x' | 'checkmark';
  };
}

export interface RadioOption {
  /** Label displayed next to the radio button */
  label: string;
  /** Value of this option */
  value: string;
}

export interface RadioField {
  /** Page number (0-indexed) */
  page: number;
  /** X coordinate (from left) in points */
  x: number;
  /** Y coordinate (from bottom) in points */
  y: number;
  /** Width in points */
  width: number;
  /** Height in points */
  height: number;
  /** Available options for the radio group */
  options: RadioOption[];
  /** Currently selected value (if any) */
  selectedValue?: string;
  /** Radio group styling options */
  settings?: {
    /** Layout direction: 'vertical' or 'horizontal' (default: 'vertical') */
    orientation?: 'horizontal' | 'vertical';
    /** Font size in points (default: 12) */
    fontSize?: number;
    /** Text color as hex string (default: #000000) */
    textColor?: string;
    /** Spacing between options in points (default: 20) */
    optionSpacing?: number;
  };
}

/**
 * PDF processing service using pdf-lib
 * Provides methods for reading, modifying, and generating PDFs
 */
export class PdfService {
  /**
   * Load a PDF from buffer
   */
  async loadPdf(pdfBuffer: Buffer): Promise<PDFDocument> {
    return PDFDocument.load(pdfBuffer);
  }

  /**
   * Create a new empty PDF
   */
  async createPdf(): Promise<PDFDocument> {
    return PDFDocument.create();
  }

  /**
   * Get PDF information
   */
  async getPdfInfo(pdfBuffer: Buffer): Promise<PdfInfo> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    const pageInfo: PageDimensions[] = pages.map((page, index) => {
      const { width, height } = page.getSize();
      return {
        pageNumber: index,
        width,
        height,
      };
    });

    return {
      pageCount: pages.length,
      pages: pageInfo,
      title: pdfDoc.getTitle(),
      author: pdfDoc.getAuthor(),
      creationDate: pdfDoc.getCreationDate(),
    };
  }

  /**
   * Get dimensions of a specific page
   */
  async getPageDimensions(
    filePath: string,
    pageNumber: number
  ): Promise<{ width: number; height: number }> {
    const fs = await import('fs/promises');
    const path = await import('path');
    // Prepend storage basePath if filePath is relative
    const storagePath = process.env.FILE_STORAGE_PATH || './storage';
    const fullPath = path.join(storagePath, filePath);
    const pdfBuffer = await fs.readFile(fullPath);
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    if (pageNumber < 0 || pageNumber >= pages.length) {
      throw new Error(`Page ${pageNumber} does not exist in PDF`);
    }

    const page = pages[pageNumber];
    if (!page) {
      throw new Error(`Page ${pageNumber} could not be retrieved`);
    }

    const { width, height } = page.getSize();
    return { width, height };
  }

  /**
   * Add signature image to PDF
   */
  async addSignature(
    pdfBuffer: Buffer,
    field: SignatureField
  ): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    if (field.page >= pages.length) {
      throw new Error(`Page ${field.page} does not exist in PDF`);
    }

    const page = pages[field.page];
    if (!page) {
      throw new Error(`Page ${field.page} could not be retrieved`);
    }

    // Convert base64 to buffer if needed
    let imageBuffer: Buffer;
    if (typeof field.imageData === 'string') {
      // Remove data URL prefix if present
      const base64Data = field.imageData.replace(
        /^data:image\/(png|jpeg|jpg);base64,/,
        ''
      );
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      imageBuffer = field.imageData;
    }

    // Determine image type and embed
    let image;
    try {
      image = await pdfDoc.embedPng(imageBuffer);
    } catch {
      try {
        image = await pdfDoc.embedJpg(imageBuffer);
      } catch (error) {
        throw new Error(
          'Unsupported image format. Only PNG and JPEG are supported.'
        );
      }
    }

    // Draw signature on page
    page.drawImage(image, {
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
    });

    return Buffer.from(await pdfDoc.save());
  }

  /**
   * Add text field to PDF
   */
  async addTextField(pdfBuffer: Buffer, field: TextField): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    if (field.page >= pages.length) {
      throw new Error(`Page ${field.page} does not exist in PDF`);
    }

    const page = pages[field.page];
    if (!page) {
      throw new Error(`Page ${field.page} could not be retrieved`);
    }
    const fontSize = field.fontSize || 12;
    const color = field.color
      ? rgb(field.color.r, field.color.g, field.color.b)
      : rgb(0, 0, 0);

    page.drawText(field.text, {
      x: field.x,
      y: field.y,
      size: fontSize,
      color,
    });

    return Buffer.from(await pdfDoc.save());
  }

  /**
   * Add date field to PDF
   */
  async addDateField(pdfBuffer: Buffer, field: DateField): Promise<Buffer> {
    const date = new Date();
    let dateText: string;

    switch (field.format) {
      case 'locale':
        dateText = date.toLocaleDateString();
        break;
      case 'short':
        dateText = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
        break;
      case 'iso':
      default:
        dateText = date.toISOString().split('T')[0] || '';
        break;
    }

    return this.addTextField(pdfBuffer, {
      ...field,
      text: dateText,
    });
  }

  /**
   * Convert hex color string to RGB values (0-1 range)
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result || !result[1] || !result[2] || !result[3]) {
      return { r: 0, g: 0, b: 0 }; // Default to black
    }
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
    };
  }

  /**
   * Add checkbox to PDF
   * Renders a checkbox with optional check mark (X or ✓)
   */
  async addCheckbox(pdfBuffer: Buffer, field: CheckboxField): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    if (field.page >= pages.length) {
      throw new Error(`Page ${field.page} does not exist in PDF`);
    }

    const page = pages[field.page];
    if (!page) {
      throw new Error(`Page ${field.page} could not be retrieved`);
    }

    const borderColorHex = field.options?.borderColor ?? '#000000';
    const checkColorHex = field.options?.checkColor ?? '#000000';
    const backgroundColorHex = field.options?.backgroundColor ?? '#FFFFFF';
    const borderColor = this.hexToRgb(borderColorHex);
    const checkColor = this.hexToRgb(checkColorHex);
    const backgroundColor = this.hexToRgb(backgroundColorHex);
    const borderWidth = field.options?.borderWidth || 1;
    const style = field.options?.style || 'x';

    // Draw background rectangle
    page.drawRectangle({
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      color: rgb(backgroundColor.r, backgroundColor.g, backgroundColor.b),
      borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
      borderWidth,
    });

    // Draw check mark if checked
    if (field.checked) {
      const padding = Math.min(field.width, field.height) * 0.2;
      const lineWidth = Math.max(1, Math.min(field.width, field.height) * 0.1);

      if (style === 'checkmark') {
        // Draw a checkmark (✓)
        const startX = field.x + padding;
        const midX = field.x + field.width * 0.35;
        const endX = field.x + field.width - padding;
        const startY = field.y + field.height * 0.5;
        const midY = field.y + padding;
        const endY = field.y + field.height - padding;

        // Short stroke (down-left part of checkmark)
        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: midX, y: midY },
          thickness: lineWidth,
          color: rgb(checkColor.r, checkColor.g, checkColor.b),
        });

        // Long stroke (up-right part of checkmark)
        page.drawLine({
          start: { x: midX, y: midY },
          end: { x: endX, y: endY },
          thickness: lineWidth,
          color: rgb(checkColor.r, checkColor.g, checkColor.b),
        });
      } else {
        // Draw X mark (default)
        // First diagonal line (top-left to bottom-right)
        page.drawLine({
          start: { x: field.x + padding, y: field.y + field.height - padding },
          end: { x: field.x + field.width - padding, y: field.y + padding },
          thickness: lineWidth,
          color: rgb(checkColor.r, checkColor.g, checkColor.b),
        });

        // Second diagonal line (top-right to bottom-left)
        page.drawLine({
          start: { x: field.x + field.width - padding, y: field.y + field.height - padding },
          end: { x: field.x + padding, y: field.y + padding },
          thickness: lineWidth,
          color: rgb(checkColor.r, checkColor.g, checkColor.b),
        });
      }
    }

    return Buffer.from(await pdfDoc.save());
  }

  /**
   * Add radio button group to PDF
   * Renders radio buttons with labels in vertical or horizontal layout
   */
  async addRadioGroup(pdfBuffer: Buffer, field: RadioField): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    if (field.page >= pages.length) {
      throw new Error(`Page ${field.page} does not exist in PDF`);
    }

    const page = pages[field.page];
    if (!page) {
      throw new Error(`Page ${field.page} could not be retrieved`);
    }

    // Import font for labels
    const { StandardFonts } = await import('pdf-lib');
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Get settings with defaults
    const fontSize = field.settings?.fontSize || 12;
    const textColorHex = field.settings?.textColor || '#000000';
    const textColor = this.hexToRgb(textColorHex);
    const spacing = field.settings?.optionSpacing || 20;
    const isVertical = field.settings?.orientation !== 'horizontal';
    const circleRadius = 6;
    const circleOuterBorderWidth = 1;

    // Starting position - for vertical, start from top of field area
    // PDF y-axis goes up, so we start at the top (y + height) and work down
    let currentX = field.x;
    let currentY = field.y + field.height - fontSize;

    for (const option of field.options) {
      const isSelected = option.value === field.selectedValue;

      // Draw outer circle (unfilled)
      page.drawCircle({
        x: currentX + circleRadius,
        y: currentY - circleRadius + fontSize / 2,
        size: circleRadius,
        borderColor: rgb(0, 0, 0),
        borderWidth: circleOuterBorderWidth,
      });

      // Draw inner filled circle if selected
      if (isSelected) {
        page.drawCircle({
          x: currentX + circleRadius,
          y: currentY - circleRadius + fontSize / 2,
          size: circleRadius - 3,
          color: rgb(0, 0, 0),
        });
      }

      // Draw label text
      page.drawText(option.label, {
        x: currentX + circleRadius * 2 + 5,
        y: currentY,
        size: fontSize,
        font,
        color: rgb(textColor.r, textColor.g, textColor.b),
      });

      // Move to next position
      if (isVertical) {
        currentY -= spacing;
      } else {
        const textWidth = font.widthOfTextAtSize(option.label, fontSize);
        currentX += circleRadius * 2 + 10 + textWidth + spacing;
      }
    }

    return Buffer.from(await pdfDoc.save());
  }

  /**
   * Add multiple fields to PDF in a single operation
   */
  async addMultipleFields(
    pdfBuffer: Buffer,
    fields: {
      signatures?: SignatureField[];
      textFields?: TextField[];
      dateFields?: DateField[];
      checkboxFields?: CheckboxField[];
      radioFields?: RadioField[];
    }
  ): Promise<Buffer> {
    let currentPdfBuffer = pdfBuffer;

    // Add signatures
    if (fields.signatures) {
      for (const signature of fields.signatures) {
        currentPdfBuffer = await this.addSignature(currentPdfBuffer, signature);
      }
    }

    // Add text fields
    if (fields.textFields) {
      for (const textField of fields.textFields) {
        currentPdfBuffer = await this.addTextField(currentPdfBuffer, textField);
      }
    }

    // Add date fields
    if (fields.dateFields) {
      for (const dateField of fields.dateFields) {
        currentPdfBuffer = await this.addDateField(currentPdfBuffer, dateField);
      }
    }

    // Add checkbox fields
    if (fields.checkboxFields) {
      for (const checkboxField of fields.checkboxFields) {
        currentPdfBuffer = await this.addCheckbox(currentPdfBuffer, checkboxField);
      }
    }

    // Add radio fields
    if (fields.radioFields) {
      for (const radioField of fields.radioFields) {
        currentPdfBuffer = await this.addRadioGroup(currentPdfBuffer, radioField);
      }
    }

    return currentPdfBuffer;
  }

  /**
   * Merge multiple PDFs into one
   */
  async mergePdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
    const mergedPdf = await this.createPdf();

    for (const buffer of pdfBuffers) {
      const pdf = await this.loadPdf(buffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    return Buffer.from(await mergedPdf.save());
  }

  /**
   * Extract specific pages from PDF
   */
  async extractPages(
    pdfBuffer: Buffer,
    pageNumbers: number[]
  ): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const newPdf = await this.createPdf();

    const copiedPages = await newPdf.copyPages(pdfDoc, pageNumbers);
    copiedPages.forEach((page) => newPdf.addPage(page));

    return Buffer.from(await newPdf.save());
  }

  /**
   * Add watermark to all pages
   */
  async addWatermark(
    pdfBuffer: Buffer,
    text: string,
    options?: {
      fontSize?: number;
      opacity?: number;
      rotation?: number;
      color?: { r: number; g: number; b: number };
    }
  ): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    const fontSize = options?.fontSize || 48;
    const opacity = options?.opacity !== undefined ? options.opacity : 0.3;
    const rotation = options?.rotation || 45;
    const color = options?.color
      ? rgb(options.color.r, options.color.g, options.color.b)
      : rgb(0.7, 0.7, 0.7);

    for (const page of pages) {
      const { width, height } = page.getSize();

      page.drawText(text, {
        x: width / 2,
        y: height / 2,
        size: fontSize,
        color,
        opacity,
        rotate: degrees(rotation),
      });
    }

    return Buffer.from(await pdfDoc.save());
  }

  /**
   * Add certificate of completion to PDF
   */
  async addCertificate(
    pdfBuffer: Buffer,
    certificateData: {
      documentTitle: string;
      completedDate: Date;
      signers: Array<{
        name: string;
        email: string;
        signedAt: Date;
      }>;
      documentId: string;
    }
  ): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);

    // Add a new page at the end for the certificate
    const certificatePage = pdfDoc.addPage();
    const { height } = certificatePage.getSize();

    const titleFontSize = 24;
    const normalFontSize = 12;
    const smallFontSize = 10;

    let y = height - 50;

    // Title
    certificatePage.drawText('Certificate of Completion', {
      x: 50,
      y,
      size: titleFontSize,
      color: rgb(0, 0, 0),
    });

    y -= 40;

    // Document info
    certificatePage.drawText(`Document: ${certificateData.documentTitle}`, {
      x: 50,
      y,
      size: normalFontSize,
      color: rgb(0, 0, 0),
    });

    y -= 25;

    certificatePage.drawText(
      `Completed: ${certificateData.completedDate.toLocaleString()}`,
      {
        x: 50,
        y,
        size: normalFontSize,
        color: rgb(0, 0, 0),
      }
    );

    y -= 25;

    certificatePage.drawText(
      `Document ID: ${certificateData.documentId}`,
      {
        x: 50,
        y,
        size: smallFontSize,
        color: rgb(0.3, 0.3, 0.3),
      }
    );

    y -= 40;

    // Signers section
    certificatePage.drawText('Signers:', {
      x: 50,
      y,
      size: normalFontSize,
      color: rgb(0, 0, 0),
    });

    y -= 25;

    for (const signer of certificateData.signers) {
      certificatePage.drawText(
        `• ${signer.name} (${signer.email}) - Signed: ${signer.signedAt.toLocaleString()}`,
        {
          x: 70,
          y,
          size: smallFontSize,
          color: rgb(0, 0, 0),
        }
      );
      y -= 20;
    }

    return Buffer.from(await pdfDoc.save());
  }

  /**
   * Flatten PDF (remove form fields and annotations)
   */
  async flattenPdf(pdfBuffer: Buffer): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const form = pdfDoc.getForm();

    // Flatten all form fields
    try {
      form.flatten();
    } catch {
      // PDF might not have form fields
    }

    return Buffer.from(await pdfDoc.save());
  }

  /**
   * Get page as image (returns PNG buffer)
   * Uses pdfjs-dist and canvas to render PDF pages as images
   */
  async getPageAsImage(
    pdfBuffer: Buffer,
    pageNumber: number,
    options?: { width?: number; height?: number; scale?: number }
  ): Promise<Buffer> {
    // Use legacy build for Node.js compatibility
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const canvasModule = await import('canvas');
    const { createCanvas } = canvasModule;

    // Provide Node.js polyfills for browser APIs that pdfjs-dist expects
    // DOMMatrix is required for PDF rendering transformations
    const nodeCanvasFactory = {
      create: (width: number, height: number) => {
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        return { canvas, context };
      },
      reset: (canvasAndContext: { canvas: ReturnType<typeof createCanvas>; context: any }, width: number, height: number) => {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
      },
      destroy: (canvasAndContext: { canvas: ReturnType<typeof createCanvas>; context: any }) => {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
      },
    };

    // Load PDF with pdfjs-dist using Node.js-compatible options
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      isOffscreenCanvasSupported: false,
      // Disable worker for Node.js environment
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;

    // Get page (pdfjs uses 1-based indexing)
    const page = await pdf.getPage(pageNumber + 1);

    const scale = options?.scale || 1.5;
    const viewport = page.getViewport({ scale });

    const canvasWidth = options?.width || viewport.width;
    const canvasHeight = options?.height || viewport.height;

    // Create canvas using factory
    const { canvas, context } = nodeCanvasFactory.create(Math.ceil(canvasWidth), Math.ceil(canvasHeight));

    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context as any,
      viewport: viewport,
      canvasFactory: nodeCanvasFactory,
    };
    await page.render(renderContext as any).promise;

    // Convert canvas to PNG buffer
    return canvas.toBuffer('image/png');
  }

  /**
   * Generate thumbnail for first page of PDF
   */
  async generateThumbnail(
    pdfBuffer: Buffer,
    options?: { maxWidth?: number; maxHeight?: number }
  ): Promise<Buffer> {
    const sharp = await import('sharp');

    // Get first page as image
    const pageImage = await this.getPageAsImage(pdfBuffer, 0, { scale: 2 });

    // Resize to thumbnail size using sharp
    const maxWidth = options?.maxWidth || 200;
    const maxHeight = options?.maxHeight || 300;

    const thumbnail = await sharp.default(pageImage)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    return thumbnail;
  }

  /**
   * Optimize PDF (reduce file size)
   */
  async optimizePdf(pdfBuffer: Buffer): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);

    // Save with compression
    const pdfBytes = await pdfDoc.save({
      useObjectStreams: true,
    });

    return Buffer.from(pdfBytes);
  }
}

/**
 * Create a singleton instance
 */
export const pdfService = new PdfService();
