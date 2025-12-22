import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import Button from '@/components/Button';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type { AuditEvent } from '@/types';

/**
 * Audit trail page showing document history
 */
export const AuditTrail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');

  const { data: auditEvents = [], isLoading } = useQuery<AuditEvent[]>({
    queryKey: ['audit-events', id],
    queryFn: async () => {
      const response = await apiClient.get(`/documents/${id}/audit`);
      return response.data;
    },
    enabled: !!id,
  });

  const filteredEvents = eventTypeFilter
    ? auditEvents.filter((event) => event.event_type === eventTypeFilter)
    : auditEvents;

  const eventTypes = Array.from(new Set(auditEvents.map((e) => e.event_type)));

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEventIcon = (eventType: string) => {
    const icons: Record<string, string> = {
      document_created: '📄',
      document_sent: '📤',
      document_viewed: '👁️',
      field_added: '➕',
      field_updated: '✏️',
      field_deleted: '🗑️',
      signer_added: '👤',
      signature_added: '✍️',
      document_completed: '✅',
      document_cancelled: '❌',
      template_created: '📋',
    };
    return icons[eventType] || '📌';
  };

  const getEventDescription = (event: AuditEvent) => {
    const descriptions: Record<string, string> = {
      document_created: 'Document created',
      document_sent: 'Document sent for signing',
      document_viewed: 'Document viewed',
      field_added: 'Field added to document',
      field_updated: 'Field updated',
      field_deleted: 'Field deleted',
      signer_added: 'Signer added',
      signature_added: 'Signature added',
      document_completed: 'Document completed',
      document_cancelled: 'Document cancelled',
      template_created: 'Saved as template',
    };
    return descriptions[event.event_type] || event.event_type;
  };

  const handleExportPDF = () => {
    // Export to PDF
    window.print();
  };

  const handleExportCSV = () => {
    const csvHeaders = ['Timestamp', 'Event Type', 'IP Address', 'User Agent'];
    const csvRows = filteredEvents.map((event) => [
      event.created_at,
      event.event_type,
      event.ip_address || 'N/A',
      event.user_agent || 'N/A',
    ]);

    const csv = [
      csvHeaders.join(','),
      ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div style={{ padding: '2rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
          }}
        >
          <h1>Audit Trail</h1>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Button variant="secondary" onClick={handleExportCSV}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={handleExportPDF}>
              Export PDF
            </Button>
          </div>
        </div>

        {/* Filter */}
        <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label style={{ fontWeight: '500' }}>Filter by event type:</label>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            style={{
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '1rem',
            }}
          >
            <option value="">All Events</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
          {eventTypeFilter && (
            <Button size="sm" variant="secondary" onClick={() => setEventTypeFilter('')}>
              Clear Filter
            </Button>
          )}
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#666' }}>
            Loading audit trail...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '4rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '2px dashed #dee2e6',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <h3 style={{ marginBottom: '0.5rem' }}>No audit events</h3>
            <p style={{ color: '#666' }}>
              {eventTypeFilter
                ? 'No events found for this filter'
                : 'Audit events will appear here'}
            </p>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Timeline line */}
            <div
              style={{
                position: 'absolute',
                left: '2rem',
                top: '1rem',
                bottom: '1rem',
                width: '2px',
                backgroundColor: '#dee2e6',
              }}
            />

            {/* Events */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {filteredEvents.map((event) => (
                <div
                  key={event.id}
                  style={{
                    display: 'flex',
                    gap: '1.5rem',
                    position: 'relative',
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: '4rem',
                      height: '4rem',
                      borderRadius: '50%',
                      backgroundColor: 'white',
                      border: '2px solid #dee2e6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      flexShrink: 0,
                      zIndex: 1,
                    }}
                  >
                    {getEventIcon(event.event_type)}
                  </div>

                  {/* Content */}
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: 'white',
                      border: '1px solid #dee2e6',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                        {getEventDescription(event)}
                      </h3>
                      <div style={{ fontSize: '0.875rem', color: '#666' }}>
                        {formatDate(event.created_at)}
                      </div>
                    </div>

                    {/* Event details */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#666',
                      }}
                    >
                      {event.ip_address && (
                        <>
                          <strong>IP Address:</strong>
                          <span>{event.ip_address}</span>
                        </>
                      )}
                      {event.user_agent && (
                        <>
                          <strong>User Agent:</strong>
                          <span style={{ wordBreak: 'break-all' }}>{event.user_agent}</span>
                        </>
                      )}
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <>
                          <strong>Details:</strong>
                          <span>{JSON.stringify(event.metadata)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AuditTrail;
