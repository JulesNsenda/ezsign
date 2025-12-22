# Changelog

All notable changes to EzSign will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-12-22

### Added

#### Security & Authentication
- **Two-Factor Authentication (2FA)**: TOTP-based 2FA with QR code setup, backup codes, and secure verification flow
- **API Key Authentication**: Proper user data population for API key requests with role-based access

#### Infrastructure & Scalability
- **S3 Cloud Storage**: AWS S3 adapter for scalable file storage (supports S3-compatible services like MinIO)
- **Real-Time WebSocket**: Socket.io integration for live document status updates and notifications
- **Structured Logging**: Winston-based logging with correlation IDs, log rotation, and configurable levels
- **Health Check Endpoints**: `/health`, `/health/ready`, and `/health/detailed` for monitoring
- **File Cleanup Worker**: Automated cleanup of orphaned and temporary files

#### Document Features
- **Scheduled Document Sending**: Schedule documents to be sent at a future date/time with timezone support
- **PDF Thumbnails**: Auto-generated document thumbnails displayed in document list
- **Textarea Field Type**: Multi-line text input field for longer text entries
- **Radio Button Field**: Single-select radio button groups with customizable options
- **Dropdown Field**: Select/dropdown fields with configurable options
- **Checkbox PDF Rendering**: Proper checkbox rendering with checkmark/X styles

#### User Experience
- **Dark Mode Theme**: System-aware dark/light theme with manual toggle and persistence
- **Error Boundary**: Graceful error handling with user-friendly fallback UI
- **Required Field Enforcement**: Validation preventing submission until all required fields are completed
- **Confirmation Modals**: Replaced browser alert/confirm dialogs with styled modal components

### Fixed
- API key authentication now properly fetches and attaches user data
- Improved error messages for scheduling validation
- Fixed textarea field minimum size requirements

### Changed
- Upgraded logging from console.log to structured Winston logger throughout codebase
- Improved WebSocket event handling for document updates

## [0.1.0] - 2024-10-18

### Added
- Initial release
- Document upload and management
- PDF field placement (signature, initials, date, text, checkbox)
- Multi-signer support (single, sequential, parallel workflows)
- Email notifications for signing requests
- Template system for reusable documents
- Team management
- Audit trail logging
- Webhook integrations
- Basic authentication with JWT tokens
