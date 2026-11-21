import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';

process.env.MONGODB_URI ??= 'mongodb://localhost:27017/kharcha-book-test';
process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/modules/users/model.js');
const { default: RefreshToken } = await import('../src/modules/auth/refreshToken.model.js');
const { default: PasswordReset } = await import('../src/modules/auth/passwordReset.model.js');
const { default: mailer } = await import('../src/utils/mailer.js');
const { default: config } = await import('../src/config/config.js');

let server;
let baseUrl;
const userId = '64b0000000000000000000c1';

before(async () => {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    server.close();
    await once(server, 'close');
});

const postJson = (path, body, headers = {}) => fetch(`${baseUrl}/api/v1/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
});

const hashOtp = (otp) => createHmac('sha256', config.JWT_SECRET).update(`${userId}:${otp}`).digest('hex');

test('forgot-password emails a 6-digit OTP and stores only its hash', async () => {
    const original = {
        findOne: User.findOne,
        resetFindOne: PasswordReset.findOne,
        resetUpdate: PasswordReset.findOneAndUpdate,
        send: mailer.send,
    };
    let sent;
    let stored;
    User.findOne = (filter) => {
        assert.deepEqual(filter, { email: 'owner@example.com', role: 'admin' });
        return { select: async () => ({ _id: userId, email: 'owner@example.com', fullName: 'Owner' }) };
    };
    PasswordReset.findOne = () => ({ select: async () => null });
    PasswordReset.findOneAndUpdate = async (filter, update) => {
        stored = update.$set;
        return stored;
    };
    mailer.send = async (message) => { sent = message; };

    try {
        const response = await postJson('forgot-password', { email: 'Owner@Example.com' });
        assert.equal(response.status, 200);
        const otp = sent.text.match(/\b(\d{6})\b/)[1];
        assert.equal(sent.to, 'owner@example.com');
        assert.equal(stored.attempts, 0);
        assert.notEqual(stored.otpHash, otp);
        assert.equal(stored.otpHash, hashOtp(otp));
        assert.ok(stored.expiresAt.getTime() > Date.now());
    } finally {
        User.findOne = original.findOne;
        PasswordReset.findOne = original.resetFindOne;
        PasswordReset.findOneAndUpdate = original.resetUpdate;
        mailer.send = original.send;
    }
});

test('forgot-password gives the same response for unknown emails and sends nothing', async () => {
    const original = { findOne: User.findOne, send: mailer.send };
    let mailCount = 0;
    User.findOne = () => ({ select: async () => null });
    mailer.send = async () => { mailCount += 1; };

    try {
        const response = await postJson('forgot-password', { email: 'nobody@example.com' });
        assert.equal(response.status, 200);
        assert.equal(mailCount, 0);
    } finally {
        User.findOne = original.findOne;
        mailer.send = original.send;
    }
});

test('forgot-password does not resend within the cooldown window', async () => {
    const original = { findOne: User.findOne, resetFindOne: PasswordReset.findOne, send: mailer.send };
    let mailCount = 0;
    User.findOne = () => ({ select: async () => ({ _id: userId, email: 'owner@example.com', fullName: 'Owner' }) });
    PasswordReset.findOne = () => ({ select: async () => ({ updatedAt: new Date() }) });
    mailer.send = async () => { mailCount += 1; };

    try {
        const response = await postJson('forgot-password', { email: 'owner@example.com' });
        assert.equal(response.status, 200);
        assert.equal(mailCount, 0);
    } finally {
        User.findOne = original.findOne;
        PasswordReset.findOne = original.resetFindOne;
        mailer.send = original.send;
    }
});

test('forgot-password validates the email address', async () => {
    const response = await postJson('forgot-password', { email: 'not-an-email' });
    assert.equal(response.status, 400);
});

const mockResetRecord = (otp) => {
    const original = {
        findOne: User.findOne,
        updateOne: User.updateOne,
        resetUpdate: PasswordReset.findOneAndUpdate,
        resetDelete: PasswordReset.deleteOne,
        tokenDelete: RefreshToken.deleteMany,
    };
    const state = { attempts: 0, passwordHash: null, tokensRevoked: false, consumed: false };
    User.findOne = () => ({ select: async () => ({ _id: userId }) });
    PasswordReset.findOneAndUpdate = async (filter, update) => {
        assert.equal(filter.userId, userId);
        assert.deepEqual(update, { $inc: { attempts: 1 } });
        state.attempts += 1;
        return state.attempts > 5 ? null : { _id: 'reset-1', otpHash: hashOtp(otp), attempts: state.attempts };
    };
    PasswordReset.deleteOne = async () => {
        state.consumed = true;
        return { deletedCount: 1 };
    };
    User.updateOne = async (filter, update) => {
        state.passwordHash = update.$set.passwordHash;
        state.softPassword = update.$set.softPassword;
        return { modifiedCount: 1 };
    };
    RefreshToken.deleteMany = async (filter) => {
        assert.equal(filter.userId, userId);
        state.tokensRevoked = true;
        return { deletedCount: 1 };
    };
    const restore = () => {
        User.findOne = original.findOne;
        User.updateOne = original.updateOne;
        PasswordReset.findOneAndUpdate = original.resetUpdate;
        PasswordReset.deleteOne = original.resetDelete;
        RefreshToken.deleteMany = original.tokenDelete;
    };
    return { state, restore };
};

test('reset-password accepts the right OTP, stores a hashed password, and revokes sessions', async () => {
    const { state, restore } = mockResetRecord('482915');
    try {
        const response = await postJson('reset-password', {
            email: 'owner@example.com', otp: '482915', newPassword: '4321',
        });
        assert.equal(response.status, 200);
        assert.equal(state.consumed, true);
        assert.equal(state.tokensRevoked, true);
        assert.match(state.passwordHash, /^scrypt\$/);
        assert.ok(await verifyPassword('4321', state.passwordHash));
        assert.equal(state.softPassword, '4321');
    } finally {
        restore();
    }
});

test('reset-password rejects a wrong OTP without changing the password', async () => {
    const { state, restore } = mockResetRecord('482915');
    try {
        const response = await postJson('reset-password', {
            email: 'owner@example.com', otp: '000000', newPassword: '4321',
        });
        assert.equal(response.status, 400);
        assert.equal(state.passwordHash, null);
        assert.equal(state.consumed, false);
    } finally {
        restore();
    }
});

test('reset-password locks out after too many attempts and validates input', async () => {
    const { restore } = mockResetRecord('482915');
    try {
        const body = { email: 'owner@example.com', otp: '482915', newPassword: '4321' };
        // Attempts 1-5 reach the OTP check; the 6th finds the record locked out.
        for (let i = 0; i < 5; i += 1) assert.equal((await postJson('reset-password', body)).status, 200);
        assert.equal((await postJson('reset-password', body)).status, 400);
    } finally {
        restore();
    }
});

test('reset-password validates the OTP and new password format', async () => {
    const short = await postJson('reset-password', { email: 'owner@example.com', otp: '12', newPassword: '4321' });
    const letters = await postJson('reset-password', { email: 'owner@example.com', otp: '123456', newPassword: 'abcd' });
    assert.equal(short.status, 400);
    assert.equal(letters.status, 400);
});

const accessToken = () => jwt.sign(
    { accountId: userId, branchId: '64b0000000000000000000b1', role: 'admin' },
    config.JWT_SECRET,
    { subject: userId, issuer: 'kharcha-book-api', audience: 'kharcha-book-client', expiresIn: 60 },
);

test('change-password requires authentication', async () => {
    const response = await postJson('change-password', { currentPassword: '1234', newPassword: '4321' });
    assert.equal(response.status, 401);
});

test('change-password verifies the current password, updates the hash, and revokes sessions', async () => {
    const original = { findById: User.findById, updateOne: User.updateOne, tokenDelete: RefreshToken.deleteMany };
    const passwordHash = await hashPassword('1234');
    let newHash;
    let revoked = false;
    User.findById = (id) => {
        assert.equal(id, userId);
        return { select: async () => ({ _id: userId, passwordHash }) };
    };
    User.updateOne = async (filter, update) => {
        newHash = update.$set.passwordHash;
        assert.equal(update.$set.softPassword, '4321');
        return {};
    };
    RefreshToken.deleteMany = async () => {
        revoked = true;
        return {};
    };
    const headers = { authorization: `Bearer ${accessToken()}` };

    try {
        const wrong = await postJson('change-password', { currentPassword: '9999', newPassword: '4321' }, headers);
        assert.equal(wrong.status, 401);
        assert.equal(newHash, undefined);

        const same = await postJson('change-password', { currentPassword: '1234', newPassword: '1234' }, headers);
        assert.equal(same.status, 400);

        const ok = await postJson('change-password', { currentPassword: '1234', newPassword: '4321' }, headers);
        assert.equal(ok.status, 200);
        assert.ok(await verifyPassword('4321', newHash));
        assert.equal(revoked, true);
    } finally {
        User.findById = original.findById;
        User.updateOne = original.updateOne;
        RefreshToken.deleteMany = original.tokenDelete;
    }
});
