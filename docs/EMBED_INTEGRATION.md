# Embedded Signing Integration Guide

This guide explains how to embed EzSign's document signing experience in your application using an iframe.

## Quick Start

### Basic iframe Setup

```html
<iframe
  id="ezsign-frame"
  src="https://your-ezsign-instance.com/sign/{SIGNING_TOKEN}?embedded=true&origin=https://your-app.com"
  style="width: 100%; height: 600px; border: none;"
  allow="camera"
></iframe>
```

### URL Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `embedded` | Yes | Set to `true` to enable embedded mode |
| `origin` | Yes | Your application's origin for PostMessage security |
| `theme` | No | `light` or `dark` - override theme |
| `primaryColor` | No | Hex color (e.g., `#4F46E5`) for buttons |
| `hideProgress` | No | Set to `true` to hide the progress bar |

### Example URL

```
https://ezsign.example.com/sign/abc123def456?embedded=true&origin=https://myapp.com&primaryColor=%234F46E5&theme=light
```

## Server Configuration

### Allowed Origins

Configure `EMBED_ALLOWED_ORIGINS` in your backend `.env` file:

```bash
# Allow specific origins (recommended for production)
EMBED_ALLOWED_ORIGINS=https://partner1.com,https://partner2.com

# Allow all origins (development only - NOT recommended for production)
EMBED_ALLOWED_ORIGINS=*
```

## PostMessage API

### Events (EzSign -> Parent)

Listen for events from the embedded signing iframe:

```javascript
window.addEventListener('message', (event) => {
  // IMPORTANT: Verify the origin
  if (event.origin !== 'https://your-ezsign-instance.com') return;

  const { type, documentId, payload } = event.data;

  switch (type) {
    case 'ezsign:ready':
      console.log('Document loaded', payload);
      // payload: { status: 'ready', signerId, signerEmail }
      break;

    case 'ezsign:signed':
      console.log('Document signed!', payload);
      // payload: { status: 'signed', signerId }
      // Show success message, redirect, etc.
      break;

    case 'ezsign:declined':
      console.log('Signer declined', payload);
      // payload: { status: 'declined', signerId }
      break;

    case 'ezsign:error':
      console.error('Signing error', payload);
      // payload: { error: 'message', errorCode: 'CODE' }
      break;

    case 'ezsign:pageChange':
      console.log('Page changed', payload);
      // payload: { pageNumber, totalPages }
      break;

    case 'ezsign:progress':
      console.log('Progress updated', payload);
      // payload: { progress, completedFields, totalFields }
      break;

    case 'ezsign:fieldFocused':
      console.log('Field focused', payload);
      // payload: { fieldId, fieldType, pageNumber }
      break;
  }
});
```

### Commands (Parent -> EzSign)

Send commands to the embedded signing iframe:

```javascript
const iframe = document.getElementById('ezsign-frame');

// Get current status
iframe.contentWindow.postMessage(
  { type: 'ezsign:getStatus' },
  'https://your-ezsign-instance.com'
);

// Scroll to a specific field
iframe.contentWindow.postMessage(
  { type: 'ezsign:scrollToField', payload: { fieldId: 'field-123' } },
  'https://your-ezsign-instance.com'
);

// Change theme dynamically
iframe.contentWindow.postMessage(
  { type: 'ezsign:setTheme', payload: { theme: 'dark', primaryColor: '#10B981' } },
  'https://your-ezsign-instance.com'
);
```

## Framework Examples

### React

```jsx
import { useEffect, useRef, useCallback } from 'react';

function SigningEmbed({ signingToken, onSigned, onError }) {
  const iframeRef = useRef(null);
  const ezsignOrigin = 'https://your-ezsign-instance.com';

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== ezsignOrigin) return;

      const { type, payload } = event.data;

      switch (type) {
        case 'ezsign:signed':
          onSigned?.(payload);
          break;
        case 'ezsign:error':
          onError?.(payload);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSigned, onError]);

  const signingUrl = `${ezsignOrigin}/sign/${signingToken}?embedded=true&origin=${window.location.origin}`;

  return (
    <iframe
      ref={iframeRef}
      src={signingUrl}
      style={{ width: '100%', height: '600px', border: 'none' }}
      allow="camera"
      title="Document Signing"
    />
  );
}
```

### Vue.js

```vue
<template>
  <iframe
    ref="signingFrame"
    :src="signingUrl"
    style="width: 100%; height: 600px; border: none;"
    allow="camera"
  />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  signingToken: String,
});

const emit = defineEmits(['signed', 'error']);

const ezsignOrigin = 'https://your-ezsign-instance.com';

const signingUrl = computed(() =>
  `${ezsignOrigin}/sign/${props.signingToken}?embedded=true&origin=${window.location.origin}`
);

const handleMessage = (event) => {
  if (event.origin !== ezsignOrigin) return;

  const { type, payload } = event.data;

  if (type === 'ezsign:signed') {
    emit('signed', payload);
  } else if (type === 'ezsign:error') {
    emit('error', payload);
  }
};

onMounted(() => window.addEventListener('message', handleMessage));
onUnmounted(() => window.removeEventListener('message', handleMessage));
</script>
```

### Vanilla JavaScript

```html
<!DOCTYPE html>
<html>
<head>
  <title>Document Signing</title>
  <style>
    .signing-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    .signing-frame {
      width: 100%;
      height: 600px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }
    .status {
      padding: 10px;
      margin-top: 10px;
      border-radius: 4px;
    }
    .status.success { background: #d1fae5; color: #065f46; }
    .status.error { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="signing-container">
    <h1>Sign Your Document</h1>

    <iframe
      id="ezsign-frame"
      class="signing-frame"
      allow="camera"
    ></iframe>

    <div id="status" class="status" style="display: none;"></div>
  </div>

  <script>
    const EZSIGN_ORIGIN = 'https://your-ezsign-instance.com';
    const SIGNING_TOKEN = 'YOUR_SIGNING_TOKEN'; // Get this from your backend

    // Initialize iframe
    const iframe = document.getElementById('ezsign-frame');
    iframe.src = `${EZSIGN_ORIGIN}/sign/${SIGNING_TOKEN}?embedded=true&origin=${window.location.origin}`;

    // Listen for events
    window.addEventListener('message', (event) => {
      if (event.origin !== EZSIGN_ORIGIN) return;

      const { type, payload } = event.data;
      const statusEl = document.getElementById('status');

      switch (type) {
        case 'ezsign:ready':
          console.log('Ready to sign');
          break;

        case 'ezsign:signed':
          statusEl.textContent = 'Document signed successfully!';
          statusEl.className = 'status success';
          statusEl.style.display = 'block';
          // Redirect or update UI
          break;

        case 'ezsign:error':
          statusEl.textContent = `Error: ${payload.error}`;
          statusEl.className = 'status error';
          statusEl.style.display = 'block';
          break;
      }
    });
  </script>
</body>
</html>
```

## Styling

### Custom Primary Color

Pass a hex color via the `primaryColor` URL parameter:

```
?embedded=true&origin=...&primaryColor=%23FF5722
```

Note: The `#` must be URL-encoded as `%23`.

### Theme Override

Force light or dark theme:

```
?embedded=true&origin=...&theme=dark
```

### CSS Custom Properties

The embedded signing page uses these CSS variables that you can override via PostMessage:

- `--embed-primary`: Primary button/accent color

## Security Considerations

### Origin Validation

1. **Server-side**: Configure `EMBED_ALLOWED_ORIGINS` to only allow trusted domains
2. **Client-side**: Always verify `event.origin` before processing PostMessage events

### Content Security Policy

The backend automatically sets appropriate CSP headers:
- `frame-ancestors` directive limits which origins can embed the page
- `X-Frame-Options` header for legacy browser support

### HTTPS

Always use HTTPS for both the parent application and the EzSign instance in production.

## Troubleshooting

### iframe not loading

1. Check browser console for CSP errors
2. Verify `EMBED_ALLOWED_ORIGINS` includes your domain
3. Ensure the origin parameter matches your domain exactly

### PostMessage not received

1. Verify you're listening on the correct origin
2. Check that the iframe has fully loaded before sending commands
3. Ensure the signing token is valid

### Camera not working (for drawn signatures)

Make sure to add `allow="camera"` attribute to the iframe.

## Event Reference

| Event | Description | Payload |
|-------|-------------|---------|
| `ezsign:ready` | Document loaded | `{ status, signerId, signerEmail }` |
| `ezsign:signed` | Signing completed | `{ status, signerId }` |
| `ezsign:declined` | Signer declined | `{ status, signerId }` |
| `ezsign:error` | Error occurred | `{ error, errorCode }` |
| `ezsign:pageChange` | PDF page changed | `{ pageNumber, totalPages }` |
| `ezsign:progress` | Progress updated | `{ progress, completedFields, totalFields }` |
| `ezsign:fieldFocused` | Field focused | `{ fieldId, fieldType, pageNumber }` |

## Command Reference

| Command | Description | Payload |
|---------|-------------|---------|
| `ezsign:getStatus` | Request current status | - |
| `ezsign:scrollToField` | Scroll to field | `{ fieldId }` |
| `ezsign:setTheme` | Change theme | `{ theme?, primaryColor? }` |
