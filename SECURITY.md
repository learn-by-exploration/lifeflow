# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.7.x   | :white_check_mark: |
| 0.6.x   | :white_check_mark: (security fixes only) |
| < 0.6   | :x:                |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please report vulnerabilities privately:

1. **Email:** Send details to the repository maintainer (see GitHub profile)
2. **GitHub:** Use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) if enabled on this repository

### What to include

- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Potential impact
- Suggested fix (if any)

## Response Timeline

| Stage | Timeframe |
|-------|-----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 7 days |
| Fix development | Within 30 days (critical: 7 days) |
| Public disclosure | After fix is released |

## Disclosure Policy

We follow **coordinated disclosure**:

1. Reporter notifies us privately
2. We confirm and assess severity
3. We develop and test a fix
4. We release the fix and publish a security advisory
5. Reporter may publish their findings after the fix is released

## Security Update Process

- Security patches are released as point versions (e.g., 0.7.1)
- Critical vulnerabilities trigger an immediate release
- All security fixes are documented in [CHANGELOG.md](CHANGELOG.md)
- Users are encouraged to update promptly

## Scope

### In scope

- The LifeFlow application (`src/`, `public/`)
- Authentication and session management
- Input validation and SQL injection
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Authorization and access control (IDOR)
- Information disclosure

### Out of scope

- Third-party dependencies (report to upstream maintainers)
- Hosting infrastructure and configuration
- Denial of service (DoS) against self-hosted instances
- Social engineering

## Credit

We appreciate responsible disclosure. Security researchers who report valid vulnerabilities will be:

- Credited in the CHANGELOG entry for the fix (unless they prefer anonymity)
- Thanked in the security advisory

## Security Features

LifeFlow includes the following security measures:

- **Password hashing:** bcrypt with configurable salt rounds
- **Session management:** Cryptographic session tokens, configurable expiry
- **CSRF protection:** Double-submit cookie pattern
- **Security headers:** Helmet (CSP, X-Frame-Options, HSTS when behind HTTPS)
- **Rate limiting:** Configurable per-route rate limits
- **Input validation:** Zod schemas + parameterized SQL queries
- **TOTP 2FA:** Optional two-factor authentication
- **API tokens:** SHA-256 hashed, bearer authentication
- **Audit logging:** Tracks security-relevant actions
