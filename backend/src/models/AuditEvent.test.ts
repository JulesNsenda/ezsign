import fs from 'fs';
import path from 'path';
import {
  AuditEvent,
  AuditEventType,
  DOCUMENT_EVENT_TYPES,
  SYSTEM_EVENT_TYPES,
} from './AuditEvent';

describe('AuditEvent Model', () => {
  const mockEventData = {
    id: 'event-123',
    document_id: 'doc-123',
    user_id: 'user-123',
    event_type: 'signed' as AuditEventType,
    ip_address: '127.0.0.1',
    user_agent: 'Mozilla/5.0',
    metadata: { user_email: 'signer@example.com' },
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  };

  describe('Constructor', () => {
    it('should create an AuditEvent instance with valid data', () => {
      const event = new AuditEvent(mockEventData);
      expect(event.id).toBe(mockEventData.id);
      expect(event.document_id).toBe(mockEventData.document_id);
      expect(event.event_type).toBe('signed');
    });
  });

  describe('isValidEventType', () => {
    it('accepts every document lifecycle verb', () => {
      DOCUMENT_EVENT_TYPES.forEach((type) => {
        expect(AuditEvent.isValidEventType(type)).toBe(true);
      });
    });

    it('accepts every system event type', () => {
      SYSTEM_EVENT_TYPES.forEach((type) => {
        expect(AuditEvent.isValidEventType(type)).toBe(true);
      });
    });

    it('rejects an unknown event type', () => {
      expect(AuditEvent.isValidEventType('not_a_real_event')).toBe(false);
    });
  });

  describe('getDescription', () => {
    it('returns a description for every document and system event type', () => {
      [...DOCUMENT_EVENT_TYPES, ...SYSTEM_EVENT_TYPES].forEach((type) => {
        const event = new AuditEvent({ ...mockEventData, event_type: type });
        expect(event.getDescription()).not.toBe('Unknown event');
      });
    });
  });

  // If the DB's CHECK constraint list and this TS vocabulary ever drift
  // apart, new rows either fail to insert (constraint rejects a TS-valid
  // value) or render "Unknown event" forever (TS/description map is
  // missing a DB-valid value) - this test exists so that a future edit to
  // one without the other fails here instead of in production.
  describe('vocabulary parity with the audit_events CHECK constraint', () => {
    const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
    const constraintName = 'audit_events_event_type_check';

    // The next migration that extends this CHECK will land in a new,
    // later-named file - hardcoding a filename here would mean this test
    // has to be edited (or deleted) every time that happens. Instead, find
    // every migration that touches the constraint and take the last one:
    // migration filenames are timestamp-prefixed, so lexicographic order is
    // chronological order.
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.js'))
      .sort();
    const migrationsTouchingConstraint = migrationFiles.filter((f) =>
      fs.readFileSync(path.join(migrationsDir, f), 'utf8').includes(constraintName)
    );
    if (migrationsTouchingConstraint.length === 0) {
      throw new Error(`No migration touches the ${constraintName} constraint`);
    }
    const latestMigrationFile =
      migrationsTouchingConstraint[migrationsTouchingConstraint.length - 1]!;
    const migrationSource = fs.readFileSync(
      path.join(migrationsDir, latestMigrationFile),
      'utf8'
    );

    // Pull the `exports.up` / `exports.down` function bodies out by
    // brace-matching rather than a bounded regex: this migration's `down`
    // wraps its CHECK in a raw pgm.sql(...) template string rather than an
    // addConstraint() options object like `up` does, so a regex anchored to
    // one shape would not find the other.
    function extractFunctionBody(source: string, exportName: 'up' | 'down'): string {
      const marker = `exports.${exportName} = (pgm) => {`;
      const start = source.indexOf(marker);
      if (start === -1) {
        throw new Error(`Could not locate exports.${exportName} in ${latestMigrationFile}`);
      }
      let depth = 1;
      let i = start + marker.length;
      for (; i < source.length && depth > 0; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
      }
      return source.slice(start, i);
    }

    // Extract the comma-separated, single-quoted event_type values out of an
    // `event_type IN (...)` clause by counting parens to find the true
    // closing paren, rather than matching up to the first `)` - a value
    // that itself contained `)` would otherwise silently truncate the list.
    function extractEventTypeList(functionBody: string): string[] {
      const inMarker = 'event_type IN (';
      const start = functionBody.indexOf(inMarker);
      if (start === -1) {
        throw new Error(`Could not locate 'event_type IN (' in: ${functionBody}`);
      }
      let depth = 1;
      let i = start + inMarker.length;
      for (; i < functionBody.length && depth > 0; i++) {
        if (functionBody[i] === '(') depth++;
        else if (functionBody[i] === ')') depth--;
      }
      const clause = functionBody.slice(start + inMarker.length, i - 1);
      return [...clause.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
    }

    const upEventTypes = extractEventTypeList(extractFunctionBody(migrationSource, 'up'));
    const downEventTypes = extractEventTypeList(extractFunctionBody(migrationSource, 'down'));

    const tsEventTypes = [...DOCUMENT_EVENT_TYPES, ...SYSTEM_EVENT_TYPES];

    // The two values this migration itself adds - `down()` intentionally
    // excludes them (see the migration's own comment: it rolls back to the
    // narrower, pre-migration constraint NOT VALID, rather than deleting
    // rows written under the wider one).
    const typesAddedByThisMigration = ['signer_reminder_sent', 'user.sessions_revoked'];

    it("every TS event type is permitted by the migration's up() CHECK constraint", () => {
      tsEventTypes.forEach((type) => {
        expect(upEventTypes).toContain(type);
      });
    });

    it("every up() CHECK value is represented in the TS vocabulary", () => {
      upEventTypes.forEach((type) => {
        expect(tsEventTypes).toContain(type);
      });
    });

    it("down() narrows the CHECK constraint back by exactly the values this migration adds", () => {
      const expectedDownTypes = tsEventTypes.filter(
        (type) => !typesAddedByThisMigration.includes(type)
      );
      expect(downEventTypes.slice().sort()).toEqual(expectedDownTypes.slice().sort());
    });
  });
});
