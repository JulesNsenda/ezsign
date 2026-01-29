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

export interface DropdownField {
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
  /** Available options for the dropdown */
  options: RadioOption[];
  /** Currently selected value (if any) */
  selectedValue?: string;
  /** Dropdown styling options */
  settings?: {
    /** Placeholder text when nothing selected (default: 'Select an option') */
    placeholder?: string;
    /** Font size in points (default: 12) */
    fontSize?: number;
    /** Text color as hex string (default: #000000) */
    textColor?: string;
    /** Background color as hex string (default: #FFFFFF) */
    backgroundColor?: string;
    /** Border color as hex string (default: #000000) */
    borderColor?: string;
  };
}

export interface TextareaField {
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
  /** Text content (may contain newlines) */
  text: string;
  /** Textarea styling options */
  settings?: {
    /** Font size in points (default: 12) */
    fontSize?: number;
    /** Text color as hex string (default: #000000) */
    textColor?: string;
    /** Background color as hex string (default: #FFFFFF) */
    backgroundColor?: string;
    /** Border color as hex string (default: #000000) */
    borderColor?: string;
    /** Line height multiplier (default: 1.2) */
    lineHeight?: number;
  };
}

export interface TableColumn {
  /** Column ID */
  id: string;
  /** Column name/header */
  name: string;
  /** Column type */
  type: 'text' | 'number' | 'date' | 'checkbox';
  /** Column width in points */
  width: number;
}

export interface TableRow {
  /** Row values mapped by column ID */
  values: Record<string, string | number | boolean | null>;
}

export interface TableField {
  /** Page number (0-indexed) */
  page: number;
  /** X coordinate (from left) in points */
  x: number;
  /** Y coordinate (from bottom) in points */
  y: number;
  /** Width in points */
  width: number;
  /** Column definitions */
  columns: TableColumn[];
  /** Row data */
  rows: TableRow[];
  /** Table styling options */
  settings?: {
    /** Height of each row in points (default: 25) */
    rowHeight?: number;
    /** Font size in points (default: 10) */
    fontSize?: number;
    /** Whether to show header row (default: true) */
    showHeader?: boolean;
    /** Header background color as hex string (default: #F0F0F0) */
    headerBackgroundColor?: string;
    /** Header text color as hex string (default: #000000) */
    headerTextColor?: string;
    /** Border color as hex string (default: #000000) */
    borderColor?: string;
    /** Cell text color as hex string (default: #000000) */
    textColor?: string;
    /** Cell background color as hex string (default: #FFFFFF) */
    backgroundColor?: string;
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
   * Add a dropdown field to PDF
   * Renders as a rectangle with the selected value text and a dropdown arrow indicator
   */
  async addDropdown(pdfBuffer: Buffer, field: DropdownField): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    if (field.page >= pages.length) {
      throw new Error(`Page ${field.page} does not exist in PDF`);
    }

    const page = pages[field.page];
    if (!page) {
      throw new Error(`Page ${field.page} could not be retrieved`);
    }

    // Import font for text
    const { StandardFonts } = await import('pdf-lib');
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Get settings with defaults
    const fontSize = field.settings?.fontSize || 12;
    const textColorHex = field.settings?.textColor || '#000000';
    const textColor = this.hexToRgb(textColorHex);
    const backgroundColorHex = field.settings?.backgroundColor || '#FFFFFF';
    const backgroundColor = this.hexToRgb(backgroundColorHex);
    const borderColorHex = field.settings?.borderColor || '#000000';
    const borderColor = this.hexToRgb(borderColorHex);
    const placeholder = field.settings?.placeholder || 'Select an option';

    // Draw background rectangle
    page.drawRectangle({
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      color: rgb(backgroundColor.r, backgroundColor.g, backgroundColor.b),
      borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
      borderWidth: 1,
    });

    // Find selected option label
    const selectedOption = field.options.find((o) => o.value === field.selectedValue);
    const displayText = selectedOption?.label || placeholder;

    // Draw text (vertically centered)
    const textY = field.y + (field.height - fontSize) / 2;
    const maxTextWidth = field.width - 25; // Leave room for dropdown arrow

    // Truncate text if too long
    let truncatedText = displayText;
    while (
      font.widthOfTextAtSize(truncatedText, fontSize) > maxTextWidth &&
      truncatedText.length > 3
    ) {
      truncatedText = truncatedText.slice(0, -4) + '...';
    }

    page.drawText(truncatedText, {
      x: field.x + 5,
      y: textY,
      size: fontSize,
      font,
      color: selectedOption
        ? rgb(textColor.r, textColor.g, textColor.b)
        : rgb(0.5, 0.5, 0.5), // Gray for placeholder
    });

    // Draw dropdown arrow indicator (a small downward-pointing chevron)
    const arrowX = field.x + field.width - 15;
    const arrowY = field.y + field.height / 2;
    page.drawLine({
      start: { x: arrowX - 4, y: arrowY + 2 },
      end: { x: arrowX, y: arrowY - 2 },
      thickness: 1.5,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawLine({
      start: { x: arrowX, y: arrowY - 2 },
      end: { x: arrowX + 4, y: arrowY + 2 },
      thickness: 1.5,
      color: rgb(0.3, 0.3, 0.3),
    });

    return Buffer.from(await pdfDoc.save());
  }

  /**
   * Add a textarea (multi-line text) field to PDF
   * Wraps text within the field boundaries
   */
  async addTextarea(pdfBuffer: Buffer, field: TextareaField): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    if (field.page >= pages.length) {
      throw new Error(`Page ${field.page} does not exist in PDF`);
    }

    const page = pages[field.page];
    if (!page) {
      throw new Error(`Page ${field.page} could not be retrieved`);
    }

    // Import font for text
    const { StandardFonts } = await import('pdf-lib');
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Get settings with defaults
    const fontSize = field.settings?.fontSize || 12;
    const textColorHex = field.settings?.textColor || '#000000';
    const textColor = this.hexToRgb(textColorHex);
    const backgroundColorHex = field.settings?.backgroundColor || '#FFFFFF';
    const backgroundColor = this.hexToRgb(backgroundColorHex);
    const borderColorHex = field.settings?.borderColor || '#000000';
    const borderColor = this.hexToRgb(borderColorHex);
    const lineHeight = (field.settings?.lineHeight || 1.2) * fontSize;

    // Draw background rectangle
    page.drawRectangle({
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      color: rgb(backgroundColor.r, backgroundColor.g, backgroundColor.b),
      borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
      borderWidth: 1,
    });

    // Word wrap and render text
    const padding = 5;
    const maxWidth = field.width - padding * 2;
    const text = field.text || '';

    // Split by newlines first, then wrap each line
    const paragraphs = text.split('\n');
    const wrappedLines: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') {
        wrappedLines.push(''); // Preserve empty lines
        continue;
      }

      const words = paragraph.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            wrappedLines.push(currentLine);
          }
          // If a single word is too long, truncate it
          if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
            let truncated = word;
            while (
              font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidth &&
              truncated.length > 1
            ) {
              truncated = truncated.slice(0, -1);
            }
            wrappedLines.push(truncated + '...');
            currentLine = '';
          } else {
            currentLine = word;
          }
        }
      }
      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    }

    // Calculate starting Y position (top of field, going down)
    // PDF y-axis: y is at bottom, so we start at y + height and work down
    let currentY = field.y + field.height - padding - fontSize;
    const minY = field.y + padding; // Don't go below field boundary

    for (const line of wrappedLines) {
      if (currentY < minY) break; // Stop if we've reached the bottom

      if (line.trim()) {
        page.drawText(line, {
          x: field.x + padding,
          y: currentY,
          size: fontSize,
          font,
          color: rgb(textColor.r, textColor.g, textColor.b),
        });
      }
      currentY -= lineHeight;
    }

    return Buffer.from(await pdfDoc.save());
  }

  /**
   * Add a table field to PDF
   * Renders a table with header row and data rows
   */
  async addTable(pdfBuffer: Buffer, field: TableField): Promise<Buffer> {
    const pdfDoc = await this.loadPdf(pdfBuffer);
    const pages = pdfDoc.getPages();

    if (field.page >= pages.length) {
      throw new Error(`Page ${field.page} does not exist in PDF`);
    }

    const page = pages[field.page];
    if (!page) {
      throw new Error(`Page ${field.page} could not be retrieved`);
    }

    // Import font for text
    const { StandardFonts } = await import('pdf-lib');
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Get settings with defaults
    const rowHeight = field.settings?.rowHeight || 25;
    const fontSize = field.settings?.fontSize || 10;
    const showHeader = field.settings?.showHeader !== false;
    const headerBgColorHex = field.settings?.headerBackgroundColor || '#F0F0F0';
    const headerBgColor = this.hexToRgb(headerBgColorHex);
    const headerTextColorHex = field.settings?.headerTextColor || '#000000';
    const headerTextColor = this.hexToRgb(headerTextColorHex);
    const borderColorHex = field.settings?.borderColor || '#000000';
    const borderColor = this.hexToRgb(borderColorHex);
    const textColorHex = field.settings?.textColor || '#000000';
    const textColor = this.hexToRgb(textColorHex);
    const bgColorHex = field.settings?.backgroundColor || '#FFFFFF';
    const bgColor = this.hexToRgb(bgColorHex);

    // Calculate column widths if not explicitly set
    // Columns with width=0 will share remaining space equally
    const totalExplicitWidth = field.columns.reduce((sum, col) => sum + (col.width || 0), 0);
    const columnsWithoutWidth = field.columns.filter(col => !col.width || col.width === 0).length;
    const remainingWidth = field.width - totalExplicitWidth;
    const autoWidth = columnsWithoutWidth > 0 ? remainingWidth / columnsWithoutWidth : 0;

    const columnWidths = field.columns.map(col => col.width > 0 ? col.width : autoWidth);

    // Calculate total height
    const headerHeight = showHeader ? rowHeight : 0;
    const dataHeight = field.rows.length * rowHeight;
    const totalHeight = headerHeight + dataHeight;

    // Starting position (top of table in PDF coordinates - y is at bottom)
    const tableTop = field.y + totalHeight;
    let currentY = tableTop;
    let currentX = field.x;

    // Draw header row if enabled
    if (showHeader) {
      currentX = field.x;
      currentY = tableTop - rowHeight;

      for (let i = 0; i < field.columns.length; i++) {
        const column = field.columns[i]!;
        const colWidth = columnWidths[i]!;

        // Header cell background
        page.drawRectangle({
          x: currentX,
          y: currentY,
          width: colWidth,
          height: rowHeight,
          color: rgb(headerBgColor.r, headerBgColor.g, headerBgColor.b),
          borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
          borderWidth: 0.5,
        });

        // Header text (bold, centered)
        const textWidth = fontBold.widthOfTextAtSize(column.name, fontSize);
        const textX = currentX + (colWidth - textWidth) / 2;
        const textY = currentY + (rowHeight - fontSize) / 2;

        // Truncate if too long
        let displayText = column.name;
        const maxTextWidth = colWidth - 6; // 3px padding on each side
        while (fontBold.widthOfTextAtSize(displayText, fontSize) > maxTextWidth && displayText.length > 3) {
          displayText = displayText.slice(0, -4) + '...';
        }

        page.drawText(displayText, {
          x: Math.max(currentX + 3, textX),
          y: textY,
          size: fontSize,
          font: fontBold,
          color: rgb(headerTextColor.r, headerTextColor.g, headerTextColor.b),
        });

        currentX += colWidth;
      }
    }

    // Draw data rows
    const dataStartY = showHeader ? tableTop - rowHeight : tableTop;

    for (let rowIndex = 0; rowIndex < field.rows.length; rowIndex++) {
      const row = field.rows[rowIndex]!;
      currentX = field.x;
      currentY = dataStartY - (rowIndex + 1) * rowHeight;

      for (let colIndex = 0; colIndex < field.columns.length; colIndex++) {
        const column = field.columns[colIndex]!;
        const colWidth = columnWidths[colIndex]!;
        const cellValue = row.values[column.id];

        // Cell background
        page.drawRectangle({
          x: currentX,
          y: currentY,
          width: colWidth,
          height: rowHeight,
          color: rgb(bgColor.r, bgColor.g, bgColor.b),
          borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
          borderWidth: 0.5,
        });

        // Cell content
        if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
          if (column.type === 'checkbox') {
            // Render checkbox
            const checkboxSize = Math.min(rowHeight - 8, 14);
            const checkboxX = currentX + (colWidth - checkboxSize) / 2;
            const checkboxY = currentY + (rowHeight - checkboxSize) / 2;
            const isChecked = cellValue === true || cellValue === 'true';

            page.drawRectangle({
              x: checkboxX,
              y: checkboxY,
              width: checkboxSize,
              height: checkboxSize,
              borderColor: rgb(borderColor.r, borderColor.g, borderColor.b),
              borderWidth: 1,
            });

            if (isChecked) {
              const padding = checkboxSize * 0.2;
              const lineWidth = Math.max(1, checkboxSize * 0.1);
              // Draw X mark
              page.drawLine({
                start: { x: checkboxX + padding, y: checkboxY + checkboxSize - padding },
                end: { x: checkboxX + checkboxSize - padding, y: checkboxY + padding },
                thickness: lineWidth,
                color: rgb(borderColor.r, borderColor.g, borderColor.b),
              });
              page.drawLine({
                start: { x: checkboxX + checkboxSize - padding, y: checkboxY + checkboxSize - padding },
                end: { x: checkboxX + padding, y: checkboxY + padding },
                thickness: lineWidth,
                color: rgb(borderColor.r, borderColor.g, borderColor.b),
              });
            }
          } else {
            // Render text (left-aligned for text/date, right-aligned for numbers)
            let displayText = String(cellValue);
            const maxTextWidth = colWidth - 6;

            while (font.widthOfTextAtSize(displayText, fontSize) > maxTextWidth && displayText.length > 3) {
              displayText = displayText.slice(0, -4) + '...';
            }

            const actualTextWidth = font.widthOfTextAtSize(displayText, fontSize);
            let textX: number;

            if (column.type === 'number') {
              // Right-align numbers
              textX = currentX + colWidth - actualTextWidth - 3;
            } else {
              // Left-align text and dates
              textX = currentX + 3;
            }

            const textY = currentY + (rowHeight - fontSize) / 2;

            page.drawText(displayText, {
              x: textX,
              y: textY,
              size: fontSize,
              font,
              color: rgb(textColor.r, textColor.g, textColor.b),
            });
          }
        }

        currentX += colWidth;
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
      dropdownFields?: DropdownField[];
      textareaFields?: TextareaField[];
      tableFields?: TableField[];
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

    // Add dropdown fields
    if (fields.dropdownFields) {
      for (const dropdownField of fields.dropdownFields) {
        currentPdfBuffer = await this.addDropdown(currentPdfBuffer, dropdownField);
      }
    }

    // Add textarea fields
    if (fields.textareaFields) {
      for (const textareaField of fields.textareaFields) {
        currentPdfBuffer = await this.addTextarea(currentPdfBuffer, textareaField);
      }
    }

    // Add table fields
    if (fields.tableFields) {
      for (const tableField of fields.tableFields) {
        currentPdfBuffer = await this.addTable(currentPdfBuffer, tableField);
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
