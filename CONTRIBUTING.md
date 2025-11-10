# Contributing to EzSign

Thank you for your interest in contributing to EzSign! We welcome contributions from the community and are grateful for your support.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Issue Reporting](#issue-reporting)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Respect differing viewpoints and experiences
- Accept responsibility for mistakes and learn from them

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/JulesNsenda/ezsign.git
   cd ezsign
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/JulesNsenda/ezsign.git
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Prerequisites

- Node.js 18.x or higher
- PostgreSQL 15.x or higher
- Redis 7.x or higher
- Docker (optional)

### Setup Development Environment

1. **Install dependencies**:
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

3. **Start development servers**:
   ```bash
   # Backend (from backend directory)
   npm run dev

   # Frontend (from frontend directory)
   npm run dev
   ```

### Keeping Your Fork Updated

Regularly sync your fork with the upstream repository:

```bash
git fetch upstream
git checkout develop
git merge upstream/develop
```

## Pull Request Process

1. **Create a feature branch** from `develop`:
   ```bash
   git checkout -b feature/your-feature-name develop
   ```

2. **Make your changes** following our coding standards

3. **Write or update tests** for your changes

4. **Run the test suite** and ensure all tests pass:
   ```bash
   # Backend tests
   cd backend
   npm test

   # Frontend tests
   cd frontend
   npm test
   ```

5. **Commit your changes** following our commit message guidelines

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Open a Pull Request** against the `develop` branch with:
   - Clear title describing the change
   - Detailed description of what and why
   - Reference to related issues (if applicable)
   - Screenshots (for UI changes)

8. **Address review feedback** if requested

9. **Wait for approval** from maintainers

### Pull Request Requirements

- [ ] Code follows project style guidelines
- [ ] Tests added/updated and passing
- [ ] Documentation updated (if needed)
- [ ] No merge conflicts with `develop`
- [ ] Commit messages follow conventions
- [ ] PR description clearly explains changes

## Coding Standards

### TypeScript/JavaScript

- Use **TypeScript** for all new code
- Follow **ESLint** and **Prettier** configurations
- Use **meaningful variable names**
- Add **JSDoc comments** for public APIs
- Prefer **functional programming** patterns where appropriate
- Avoid **any types** - use proper typing

### Code Style

```typescript
// Good: Descriptive names, proper typing
interface SigningRequest {
  documentId: string;
  signerEmail: string;
  expiresAt: Date;
}

async function createSigningRequest(
  request: SigningRequest
): Promise<SigningLink> {
  // Implementation
}

// Bad: Unclear names, missing types
function create(req: any) {
  // Implementation
}
```

### File Organization

- Place tests alongside source files: `component.ts` + `component.test.ts`
- Use barrel exports (`index.ts`) for public APIs
- Keep files focused and under 300 lines when possible
- Group related functionality in modules/folders

### Backend Conventions

- Use **NestJS decorators** and patterns
- Follow **SOLID principles**
- Implement **proper error handling**
- Use **dependency injection**
- Add **API documentation** (OpenAPI/Swagger)

### Frontend Conventions

- Use **functional components** with hooks
- Implement **proper prop typing** with TypeScript
- Keep components **small and focused**
- Use **custom hooks** for shared logic
- Follow **React best practices**

## Testing Guidelines

### Unit Tests

- Write tests for all business logic
- Aim for >80% code coverage
- Test edge cases and error conditions
- Use descriptive test names

```typescript
describe('DocumentService', () => {
  describe('createDocument', () => {
    it('should create a document with valid PDF', async () => {
      // Test implementation
    });

    it('should throw error for invalid file type', async () => {
      // Test implementation
    });
  });
});
```

### Integration Tests

- Test API endpoints end-to-end
- Use test database (not production)
- Clean up test data after each test
- Test authentication and authorization

### E2E Tests

- Test critical user workflows
- Use Playwright or Cypress
- Test on multiple browsers/devices
- Keep tests maintainable

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Maintenance tasks
- **perf**: Performance improvements

### Examples

```
feat(signing): add support for parallel workflows

Implement parallel signing workflow where multiple signers
can sign simultaneously without waiting for others.

Closes #123
```

```
fix(api): resolve rate limiting bypass issue

Fixed vulnerability where API keys could bypass rate limits
by using different case variations.

Fixes #456
```

## Issue Reporting

### Before Creating an Issue

1. **Search existing issues** to avoid duplicates
2. **Check documentation** for known solutions
3. **Update to latest version** to see if issue persists

### Creating a Good Issue

Include the following information:

**For Bug Reports:**
- Clear, descriptive title
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Node version, browser)
- Screenshots or error logs
- Possible solution (if you have ideas)

**For Feature Requests:**
- Clear description of the feature
- Use case and motivation
- Proposed implementation (if applicable)
- Alternatives considered

### Issue Labels

- `bug`: Something isn't working
- `feature`: New feature request
- `documentation`: Documentation improvements
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention needed
- `enhancement`: Improvement to existing feature

## Development Tips

### Debugging

- Use Node.js debugger or VS Code debugging
- Add logging with appropriate levels
- Use Redux DevTools for frontend state debugging

### Performance

- Profile slow operations
- Optimize database queries
- Lazy load components when appropriate
- Monitor bundle size

### Security

- Never commit secrets or credentials
- Validate all user inputs
- Use parameterized queries
- Follow OWASP guidelines

## Getting Help

- **Documentation**: Check the [docs](./docs) folder
- **Discussions**: Join [GitHub Discussions](https://github.com/JulesNsenda/ezsign/discussions)
- **Issues**: Search or create an issue
- **Chat**: Join our community chat (link TBD)

## Recognition

Contributors will be recognized in:
- GitHub contributors page
- Release notes
- Project README (for significant contributions)

## License

By contributing to EzSign, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to EzSign! 🎉
