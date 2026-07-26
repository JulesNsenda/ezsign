import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Pool } from 'pg';
import { TemplateService } from './templateService';
import { StorageService } from './storageService';
import { LocalStorageAdapter } from '@/adapters/LocalStorageAdapter';
import { PdfService } from './pdfService';

jest.mock('@/services/loggerService', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

/**
 * F2 (SEC-C2 follow-up): `template.name` and `document.original_filename`
 * are presence-checked only, then interpolated straight into a filename
 * uploaded with `{ directory }` alone. Root containment
 * (`resolveWithinStorage`) is not subtree containment - a name like
 * `x/../../temp/evil` still resolves inside the storage root, just not
 * inside `documents/` or `templates/`, so the guard accepted it. These
 * tests run the real `LocalStorageAdapter` (not a mock) against a temp
 * directory, the same rationale `LocalStorageAdapter.test.ts` uses: it's
 * the only place these writes run for real.
 */
describe('TemplateService storage write containment (F2)', () => {
  let baseDir: string;
  let storageService: StorageService;
  let templateService: TemplateService;
  let pool: { query: jest.Mock; connect: jest.Mock };
  let client: { query: jest.Mock; release: jest.Mock };

  beforeEach(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ezsign-template-test-'));
    baseDir = path.join(root, 'storage');
    await fs.mkdir(path.join(baseDir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'documents'), { recursive: true });
    await fs.writeFile(path.join(baseDir, 'templates', 'source.pdf'), 'template-source-bytes');
    await fs.writeFile(path.join(baseDir, 'documents', 'source.pdf'), 'document-source-bytes');

    storageService = new StorageService(new LocalStorageAdapter(baseDir));

    client = { query: jest.fn(), release: jest.fn() };
    pool = { query: jest.fn(), connect: jest.fn().mockResolvedValue(client) };

    templateService = new TemplateService(
      pool as unknown as Pool,
      storageService,
      {} as unknown as PdfService
    );
  });

  afterEach(async () => {
    await fs.rm(path.dirname(baseDir), { recursive: true, force: true });
  });

  it('createDocumentFromTemplate keeps a maliciously named template inside documents/, not wherever the name points', async () => {
    const maliciousName = 'x/../../temp/evil';

    pool.query.mockImplementation((query: string) => {
      if (query.includes('FROM templates t')) {
        return Promise.resolve({
          rows: [
            {
              id: 'template-1',
              user_id: 'user-1',
              team_id: null,
              name: maliciousName,
              description: null,
              original_document_id: null,
              file_path: 'templates/source.pdf',
              file_size: '21',
              mime_type: 'application/pdf',
              page_count: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });
      }
      if (query.includes('FROM template_fields')) {
        return Promise.resolve({ rows: [] });
      }
      throw new Error(`Unexpected pool.query: ${query}`);
    });

    client.query.mockImplementation((query: string) => {
      if (query === 'BEGIN' || query === 'COMMIT') {
        return Promise.resolve();
      }
      if (query.includes('INSERT INTO documents')) {
        return Promise.resolve({ rows: [{ id: 'document-1' }] });
      }
      throw new Error(`Unexpected client.query: ${query}`);
    });

    const documentId = await templateService.createDocumentFromTemplate('template-1', 'user-1', {
      title: 'Doc from template',
    });

    expect(documentId).toBe('document-1');

    // Nowhere under temp/ - where the malicious name points - was touched.
    await expect(fs.access(path.join(baseDir, 'temp'))).rejects.toThrow();

    // The file landed under documents/ instead, alongside the pre-seeded fixture.
    const documentsDir = (await fs.readdir(path.join(baseDir, 'documents'))).filter(
      (f) => !f.endsWith('.meta.json')
    );
    expect(documentsDir).toContain('source.pdf');
    expect(documentsDir.length).toBe(2);
  });

  it('createTemplateFromDocument keeps a maliciously named source file inside templates/, not wherever the name points', async () => {
    const maliciousFilename = 'x/../../temp/evil.pdf';

    client.query.mockImplementation((query: string) => {
      if (query === 'BEGIN' || query === 'COMMIT') {
        return Promise.resolve();
      }
      if (query.includes('SELECT * FROM documents WHERE id')) {
        return Promise.resolve({
          rows: [
            {
              id: 'document-1',
              user_id: 'user-1',
              file_path: 'documents/source.pdf',
              original_filename: maliciousFilename,
              file_size: 20,
              mime_type: 'application/pdf',
              page_count: 1,
            },
          ],
        });
      }
      if (query.includes('INSERT INTO templates')) {
        return Promise.resolve({
          rows: [
            {
              id: 'template-1',
              user_id: 'user-1',
              team_id: null,
              name: 'My Template',
              description: null,
              original_document_id: 'document-1',
              file_path: 'templates/whatever-it-ended-up-as.pdf',
              file_size: 20,
              mime_type: 'application/pdf',
              page_count: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });
      }
      if (query.includes('SELECT * FROM fields WHERE document_id')) {
        return Promise.resolve({ rows: [] });
      }
      throw new Error(`Unexpected client.query: ${query}`);
    });

    const result = await templateService.createTemplateFromDocument('document-1', 'user-1', {
      name: 'My Template',
    });

    expect(result.template.id).toBe('template-1');

    // Nowhere under temp/ - where the malicious filename points - was touched.
    await expect(fs.access(path.join(baseDir, 'temp'))).rejects.toThrow();

    const templatesDir = (await fs.readdir(path.join(baseDir, 'templates'))).filter(
      (f) => !f.endsWith('.meta.json')
    );
    expect(templatesDir).toContain('source.pdf');
    expect(templatesDir.length).toBe(2);
  });
});
