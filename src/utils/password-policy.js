'use strict';

// Top 30 common passwords that meet complexity requirements
// (these would otherwise pass the complexity check)
const COMMON_PASSWORDS = new Set([
  'password123!',
  'password1234!',
  'qwerty12345!',
  'letmein12345!',
  'welcome12345!',
  'admin1234567!',
  'changeme1234!',
  'iloveyou1234!',
  'trustno11234!',
  'sunshine1234!',
  'princess1234!',
  'football1234!',
  'charlie12345!',
  'shadow123456!',
  'master123456!',
  'dragon123456!',
  'monkey123456!',
  'abc123456789!',
  '123456789abc!',
  'passw0rd1234!',
  'p@ssword1234!',
  'p@ssw0rd1234!',
  'qwerty123456!',
  'password!2345',
  'letmein!23456',
]);

/**
 * Validate a password against the password policy.
 * @param {string} password - The password to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePassword(password) {
  const errors = [];

  if (typeof password !== 'string') {
    return { valid: false, errors: ['Password must be a string'] };
  }

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }

  if (password.length > 128) {
    errors.push('Password must be at most 128 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least 1 uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least 1 lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least 1 digit');
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least 1 special character');
  }

  // Only check common passwords if basic checks passed
  if (errors.length === 0 && COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('This is a commonly used password — please choose a more unique one');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validatePassword };
