import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import validate from '../src/middlewares/validation.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { deleteProfilePhoto, saveProfilePhoto } from '../src/modules/users/profilePhoto.js';
import Transaction from '../src/modules/transactions/model.js';
import { ExpenseType, IncomeType, PaymentMode } from '../src/modules/transactions/masters.model.js';
import Branch from '../src/modules/branches/model.js';

process.env.MONGODB_URI ??= 'mongodb://localhost:27017/kharcha-book-test';
process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/modules/users/model.js');
const { default: RefreshToken } = await import('../src/modules/auth/refreshToken.model.js');
const { default: config } = await import('../src/config/config.js');
const { default: authenticate } = await import('../src/middlewares/auth.js');
const { verify } = jwt;

let server;
let baseUrl;

const originalBranchExists = Branch.exists;

before(async () => {
    // Registration checks that no branch already uses the phone number; tests default to none.
    Branch.exists = async () => null;
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    Branch.exists = originalBranchExists;
    if (!server) return;
    server.close();
    await once(server, 'close');
});

test('root route preserves the welcome response', async () => {
    const response = await fetch(`${baseUrl}/`);

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'Hello, World!');
});

test('health route returns a successful status payload', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
});

test('Swagger UI and OpenAPI document are served', async () => {
    const uiResponse = await fetch(`${baseUrl}/api-docs/`);
    const uiHtml = await uiResponse.text();
    assert.equal(uiResponse.status, 200);
    assert.match(uiResponse.headers.get('content-type'), /text\/html/);
    assert.match(uiHtml, /Swagger UI/);

    const documentResponse = await fetch(`${baseUrl}/api-docs.json`);
    const document = await documentResponse.json();
    assert.equal(documentResponse.status, 200);
    assert.equal(document.openapi, '3.0.3');
    assert.ok(document.paths['/api/v1/auth/register']);
    assert.ok(document.paths['/api/v1/auth/login']);
    assert.ok(document.paths['/api/v1/auth/refresh']);
    assert.ok(document.paths['/api/v1/auth/logout']);
    assert.ok(document.paths['/api/v1/users/profile']);
    assert.ok(document.paths['/api/v1/users/profile/photo']);
    assert.ok(document.paths['/api/v1/transactions']);
    assert.ok(document.paths['/api/v1/transactions/summary']);
    assert.ok(document.paths['/api/v1/transactions/expense-types']);
    assert.ok(document.paths['/api/v1/transactions/income-types']);
    assert.ok(document.paths['/api/v1/transactions/payment-modes']);
    assert.deepEqual(
        document.components.schemas.RegisterRequest.required,
        ['fullName', 'phoneNumber', 'email', 'gender', 'dob', 'password', 'accountType', 'address'],
    );
});

test('profile routes require a valid access token', async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/profile`);
    assert.equal(response.status, 401);
});

test('authenticated user can retrieve and update profile fields', async () => {
    const originalFindById = User.findById;
    const profile = {
        id: 'test-user-id',
        fullName: 'Old Name',
        phoneNumber: '+919876543210',
        email: 'test@example.com',
        gender: 'other',
        dob: new Date('1990-01-01T00:00:00.000Z'),
        profilePhoto: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        save: async function save() {
            this.updatedAt = new Date('2026-02-01T00:00:00.000Z');
            return this;
        },
    };
    User.findById = async (id) => {
        assert.equal(id, 'test-user-id');
        return profile;
    };
    const accessToken = jwt.sign({ branchId: '64b0000000000000000000b1', role: 'admin' }, config.JWT_SECRET, {
        subject: 'test-user-id',
        issuer: 'kharcha-book-api',
        audience: 'kharcha-book-client',
        expiresIn: '1h',
        algorithm: 'HS256',
    });

    try {
        const getResponse = await fetch(`${baseUrl}/api/v1/users/profile`, {
            headers: { authorization: `Bearer ${accessToken}` },
        });
        const getBody = await getResponse.json();
        assert.equal(getResponse.status, 200);
        assert.equal(getBody.data.fullName, 'Old Name');
        assert.equal(getBody.data.profilePhoto, null);

        const updateResponse = await fetch(`${baseUrl}/api/v1/users/profile`, {
            method: 'PUT',
            headers: {
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ fullName: 'New Name', email: 'NEW@example.com' }),
        });
        const updateBody = await updateResponse.json();

        assert.equal(updateResponse.status, 200);
        assert.equal(updateBody.data.fullName, 'New Name');
        assert.equal(updateBody.data.email, 'new@example.com');
        assert.equal(updateBody.data.passwordHash, undefined);
    } finally {
        User.findById = originalFindById;
    }
});

test('user can create a private expense type master', async () => {
    const originalCreate = ExpenseType.create;
    let savedRecord;
    ExpenseType.create = async (record) => {
        savedRecord = { id: 'expense-type-id', ...record };
        return savedRecord;
    };
    const accessToken = jwt.sign({ branchId: '64b0000000000000000000b1', role: 'admin' }, config.JWT_SECRET, {
        subject: 'test-user-id',
        issuer: 'kharcha-book-api',
        audience: 'kharcha-book-client',
        expiresIn: '1h',
        algorithm: 'HS256',
    });

    try {
        const response = await fetch(`${baseUrl}/api/v1/transactions/expense-types`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ name: 'Food', description: 'Meals and groceries' }),
        });
        const body = await response.json();

        assert.equal(response.status, 201);
        assert.equal(body.data.name, 'Food');
        assert.equal(savedRecord.userId, 'test-user-id');
    } finally {
        ExpenseType.create = originalCreate;
    }
});

test('expense transaction stores amount in paise and requires user-owned masters', async () => {
    const originalExpenseExists = ExpenseType.exists;
    const originalPaymentExists = PaymentMode.exists;
    const originalTransactionCreate = Transaction.create;
    const originalUserFindById = User.findById;
    ExpenseType.exists = async (filter) => filter.userId === 'test-user-id';
    PaymentMode.exists = async (filter) => filter.userId === 'test-user-id';
    User.findById = () => ({ select: async () => ({ defaultBranchId: '64b0000000000000000000b1' }) });
    let savedTransaction;
    Transaction.create = async (record) => {
        savedTransaction = record;
        return {
            id: 'transaction-id',
            ...record,
            transactionDate: record.transactionDate,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        };
    };
    const accessToken = jwt.sign({ branchId: '64b0000000000000000000b1', role: 'admin' }, config.JWT_SECRET, {
        subject: 'test-user-id',
        issuer: 'kharcha-book-api',
        audience: 'kharcha-book-client',
        expiresIn: '1h',
        algorithm: 'HS256',
    });

    try {
        const response = await fetch(`${baseUrl}/api/v1/transactions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                type: 'expense',
                expenseTypeId: '64b000000000000000000001',
                paymentModeId: '64b000000000000000000002',
                amount: 0.29,
                transactionDate: '2026-10-15',
                note: 'Lunch',
            }),
        });
        const body = await response.json();

        assert.equal(response.status, 201);
        assert.equal(body.data.amount, 0.29);
        assert.equal(body.data.currency, 'INR');
        assert.equal(savedTransaction.amountPaise, 29);
        assert.equal(savedTransaction.userId, 'test-user-id');
        assert.equal(savedTransaction.branchId, '64b0000000000000000000b1');
        assert.equal(body.data.branchId, '64b0000000000000000000b1');
    } finally {
        User.findById = originalUserFindById;
        ExpenseType.exists = originalExpenseExists;
        PaymentMode.exists = originalPaymentExists;
        Transaction.create = originalTransactionCreate;
    }
});

test('monthly summary reports selected-month totals and all-time balance', async () => {
    const originalAggregate = Transaction.aggregate;
    const originalBranchExists = Branch.exists;
    let aggregateCalls = 0;
    Branch.exists = async (filter) => filter.userId === '64b000000000000000000001';
    Transaction.aggregate = async (pipeline) => {
        aggregateCalls += 1;
        assert.equal(pipeline[0].$match.userId.toString(), '64b000000000000000000001');
        assert.equal(pipeline[0].$match.branchId.toString(), '64b0000000000000000000b2');
        if (aggregateCalls === 1) {
            return [
                { _id: '2026-09', incomePaise: 10000, expensePaise: 2500 },
                { _id: '2026-10', incomePaise: 5000, expensePaise: 1200 },
            ];
        }
        return [{ _id: null, incomePaise: 15000, expensePaise: 3700 }];
    };
    const accessToken = jwt.sign({ branchId: '64b0000000000000000000b1', role: 'admin' }, config.JWT_SECRET, {
        subject: '64b000000000000000000001',
        issuer: 'kharcha-book-api',
        audience: 'kharcha-book-client',
        expiresIn: '1h',
        algorithm: 'HS256',
    });

    try {
        const response = await fetch(`${baseUrl}/api/v1/transactions/summary?month=2026-10&branchId=64b0000000000000000000b2`, {
            headers: { authorization: `Bearer ${accessToken}` },
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.data.month, '2026-10');
        assert.equal(body.data.branchId, '64b0000000000000000000b2');
        assert.equal(body.data.monthlyIncome, 50);
        assert.equal(body.data.monthlyExpense, 12);
        assert.equal(body.data.monthlyBalance, 38);
        assert.equal(body.data.totalBalance, 113);
        assert.deepEqual(body.data.months.map(({ month }) => month), ['2026-09', '2026-10']);
    } finally {
        Transaction.aggregate = originalAggregate;
        Branch.exists = originalBranchExists;
    }
});

test('profile update stores a validated local profile photo and serves it', async () => {
    const originalFindById = User.findById;
    const profile = {
        id: 'test-user-id',
        fullName: 'Test User',
        phoneNumber: '+919876543210',
        email: 'test@example.com',
        gender: 'other',
        dob: new Date('1990-01-01T00:00:00.000Z'),
        profilePhoto: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        save: async function save() { return this; },
    };
    User.findById = async () => profile;
    const accessToken = jwt.sign({ branchId: '64b0000000000000000000b1', role: 'admin' }, config.JWT_SECRET, {
        subject: 'test-user-id',
        issuer: 'kharcha-book-api',
        audience: 'kharcha-book-client',
        expiresIn: '1h',
        algorithm: 'HS256',
    });
    let savedPhotoPath;

    try {
        const form = new FormData();
        form.append(
            'profilePhoto',
            new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
                type: 'image/png',
            }),
            'profile.png',
        );
        const response = await fetch(`${baseUrl}/api/v1/users/profile/photo`, {
            method: 'PATCH',
            headers: { authorization: `Bearer ${accessToken}` },
            body: form,
        });
        const body = await response.json();
        savedPhotoPath = body.data.profilePhoto;

        assert.equal(response.status, 200);
        assert.match(savedPhotoPath, /^\/uploads\/profile-photos\/[\da-f-]+\.png$/i);

        const photoResponse = await fetch(`${baseUrl}${savedPhotoPath}`);
        assert.equal(photoResponse.status, 200);
        assert.match(photoResponse.headers.get('content-type'), /image\/png/);
    } finally {
        User.findById = originalFindById;
        if (savedPhotoPath) await deleteProfilePhoto(savedPhotoPath);
    }
});

test('OTP endpoint returns an explicit 501 response', async () => {
    for (const endpoint of ['otp']) {
        const response = await fetch(`${baseUrl}/api/v1/auth/${endpoint}`, { method: 'POST' });
        const body = await response.json();

        assert.equal(response.status, 501);
        assert.equal(body.success, false);
    }
});

test('login validates required credentials before database access', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumber: 'invalid', password: 'short' }),
    });

    assert.equal(response.status, 400);
});

test('login requires a password containing exactly four digits', async () => {
    for (const password of ['123', '12345', '12a4']) {
        const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ phoneNumber: '+919876543210', password }),
        });

        assert.equal(response.status, 400);
    }
});

const loginUser = {
    id: 'test-user-id',
    fullName: 'Test User',
    phoneNumber: '+919876543210',
    email: 'test@example.com',
    gender: 'prefer not to say',
    dob: new Date('1990-01-01T00:00:00.000Z'),
    defaultBranchId: '64b0000000000000000000b1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockBranchLogin = async (role = 'admin') => {
    const original = { branchFindOne: Branch.findOne, userFindById: User.findById };
    const passwordHash = await hashPassword('1234');
    Branch.findOne = () => ({
        select: async (fields) => {
            assert.equal(fields, '+passwordHash');
            return {
                id: '64b0000000000000000000b1',
                _id: '64b0000000000000000000b1',
                userId: 'test-user-id',
                name: 'Test User',
                phoneNumber: '+919876543210',
                role,
                passwordHash,
            };
        },
    });
    User.findById = async (id) => {
        assert.equal(id, 'test-user-id');
        return loginUser;
    };
    return () => {
        Branch.findOne = original.branchFindOne;
        User.findById = original.userFindById;
    };
};

test('login verifies the branch password hash and returns a signed access token', async () => {
    const restoreLogin = await mockBranchLogin();
    const originalFindOneAndUpdate = RefreshToken.findOneAndUpdate;
    const originalDeleteMany = RefreshToken.deleteMany;
    let savedRefreshToken;
    RefreshToken.findOneAndUpdate = async (filter, update, options) => {
        assert.equal(filter.branchId, '64b0000000000000000000b1');
        assert.deepEqual(options, { new: true, upsert: true });
        savedRefreshToken = { ...update.$set, ...update.$setOnInsert };
        return savedRefreshToken;
    };
    RefreshToken.deleteMany = async (filter) => {
        assert.equal(filter.branchId, '64b0000000000000000000b1');
        assert.equal(filter.tokenHash.$ne, savedRefreshToken.tokenHash);
        return { deletedCount: 0 };
    };

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ phoneNumber: '+919876543210', password: '1234' }),
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.data.tokenType, 'Bearer');
        assert.equal(body.data.expiresIn, 3600);
        assert.equal(typeof body.data.refreshToken, 'string');
        assert.equal(body.data.refreshToken.length, 86);
        assert.equal(body.data.user.id, 'test-user-id');
        assert.equal(body.data.role, 'admin');
        assert.equal(body.data.branch.id, '64b0000000000000000000b1');
        assert.equal(body.data.branch.isDefault, true);
        assert.equal(body.data.branch.passwordHash, undefined);
        assert.notEqual(savedRefreshToken.tokenHash, body.data.refreshToken);
        assert.equal(savedRefreshToken.userId, 'test-user-id');
        assert.equal(savedRefreshToken.branchId, '64b0000000000000000000b1');

        const claims = verify(body.data.accessToken, config.JWT_SECRET, {
            issuer: 'kharcha-book-api',
            audience: 'kharcha-book-client',
            algorithms: ['HS256'],
        });
        assert.equal(claims.sub, 'test-user-id');
        assert.equal(claims.branchId, '64b0000000000000000000b1');
        assert.equal(claims.role, 'admin');
    } finally {
        restoreLogin();
        RefreshToken.findOneAndUpdate = originalFindOneAndUpdate;
        RefreshToken.deleteMany = originalDeleteMany;
    }
});

test('web login sets the refresh token as an HttpOnly cookie', async () => {
    const restoreLogin = await mockBranchLogin();
    const originalFindOneAndUpdate = RefreshToken.findOneAndUpdate;
    const originalDeleteMany = RefreshToken.deleteMany;
    RefreshToken.findOneAndUpdate = async () => ({});
    RefreshToken.deleteMany = async () => ({ deletedCount: 0 });

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'X-Refresh-Token-Transport': 'cookie',
            },
            body: JSON.stringify({ phoneNumber: '+919876543210', password: '1234' }),
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.data.refreshToken, undefined);
        assert.match(response.headers.get('set-cookie'), /refreshToken=.*HttpOnly/i);
        assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i);
    } finally {
        restoreLogin();
        RefreshToken.findOneAndUpdate = originalFindOneAndUpdate;
        RefreshToken.deleteMany = originalDeleteMany;
    }
});

test('a new login replaces the existing refresh-token record for that branch', async () => {
    const restoreLogin = await mockBranchLogin();
    const originalFindOneAndUpdate = RefreshToken.findOneAndUpdate;
    const originalDeleteMany = RefreshToken.deleteMany;
    const tokenRecords = new Map();

    RefreshToken.findOneAndUpdate = async (filter, update, options) => {
        assert.equal(options.upsert, true);
        const record = {
            ...tokenRecords.get(filter.branchId),
            ...update.$setOnInsert,
            ...update.$set,
        };
        tokenRecords.set(filter.branchId, record);
        return record;
    };
    RefreshToken.deleteMany = async () => ({ deletedCount: 0 });

    try {
        const login = async () => {
            const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ phoneNumber: '+919876543210', password: '1234' }),
            });
            return response.json();
        };

        const firstLogin = await login();
        const firstHash = tokenRecords.get('64b0000000000000000000b1').tokenHash;
        const secondLogin = await login();
        const secondHash = tokenRecords.get('64b0000000000000000000b1').tokenHash;

        assert.equal(tokenRecords.size, 1);
        assert.notEqual(firstLogin.data.refreshToken, secondLogin.data.refreshToken);
        assert.notEqual(firstHash, secondHash);
    } finally {
        restoreLogin();
        RefreshToken.findOneAndUpdate = originalFindOneAndUpdate;
        RefreshToken.deleteMany = originalDeleteMany;
    }
});

const mockRefreshBranch = () => {
    const originalBranchFindOne = Branch.findOne;
    Branch.findOne = async (filter) => {
        assert.equal(filter._id, '64b0000000000000000000b2');
        return { id: '64b0000000000000000000b2', _id: '64b0000000000000000000b2', role: 'user' };
    };
    return () => {
        Branch.findOne = originalBranchFindOne;
    };
};

test('refresh endpoint rotates mobile refresh tokens and rejects the old token', async () => {
    const originalFindOneAndUpdate = RefreshToken.findOneAndUpdate;
    const restoreBranch = mockRefreshBranch();
    let storedHash;
    RefreshToken.findOneAndUpdate = async (filter, update) => {
        assert.notEqual(filter.tokenHash, 'mobile-refresh-token');
        assert.ok(filter.expiresAt.$gt instanceof Date);
        storedHash = update.$set.tokenHash;
        return { userId: 'test-user-id', branchId: '64b0000000000000000000b2' };
    };

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ refreshToken: 'mobile-refresh-token' }),
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(typeof body.data.accessToken, 'string');
        assert.equal(typeof body.data.refreshToken, 'string');
        assert.notEqual(body.data.refreshToken, 'mobile-refresh-token');
        assert.notEqual(storedHash, body.data.refreshToken);
        const claims = verify(body.data.accessToken, config.JWT_SECRET);
        assert.equal(claims.sub, 'test-user-id');
        assert.equal(claims.branchId, '64b0000000000000000000b2');
        assert.equal(claims.role, 'user');

        RefreshToken.findOneAndUpdate = async () => null;
        const oldTokenResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ refreshToken: 'mobile-refresh-token' }),
        });
        assert.equal(oldTokenResponse.status, 401);
    } finally {
        RefreshToken.findOneAndUpdate = originalFindOneAndUpdate;
        restoreBranch();
    }
});

test('refresh endpoint rotates web refresh tokens using the HttpOnly cookie', async () => {
    const originalFindOneAndUpdate = RefreshToken.findOneAndUpdate;
    const restoreBranch = mockRefreshBranch();
    RefreshToken.findOneAndUpdate = async () => ({
        userId: 'test-user-id',
        branchId: '64b0000000000000000000b2',
    });

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { cookie: 'refreshToken=web-refresh-token' },
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.data.refreshToken, undefined);
        assert.match(response.headers.get('set-cookie'), /refreshToken=.*HttpOnly/i);
    } finally {
        RefreshToken.findOneAndUpdate = originalFindOneAndUpdate;
        restoreBranch();
    }
});

test('logout revokes the refresh token and clears its cookie', async () => {
    const originalDeleteOne = RefreshToken.deleteOne;
    let deletedHash;
    RefreshToken.deleteOne = async (filter) => {
        deletedHash = filter.tokenHash;
        return { deletedCount: 1 };
    };

    try {
        const accessToken = jwt.sign({ branchId: '64b0000000000000000000b1', role: 'admin' }, config.JWT_SECRET, {
            subject: 'test-user-id',
            issuer: 'kharcha-book-api',
            audience: 'kharcha-book-client',
            expiresIn: '1h',
            algorithm: 'HS256',
        });
        const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
            method: 'POST',
            headers: {
                cookie: 'refreshToken=web-refresh-token',
                authorization: `Bearer ${accessToken}`,
            },
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.notEqual(deletedHash, 'web-refresh-token');
        assert.match(response.headers.get('set-cookie'), /refreshToken=;/i);
    } finally {
        RefreshToken.deleteOne = originalDeleteOne;
    }
});

test('account deletion removes refresh tokens, user, and local profile photo', async () => {
    const originalFindById = User.findById;
    const originalFindByIdAndDelete = User.findByIdAndDelete;
    const originalDeleteMany = RefreshToken.deleteMany;
    const originalTransactionDeleteMany = Transaction.deleteMany;
    const originalExpenseDeleteMany = ExpenseType.deleteMany;
    const originalIncomeDeleteMany = IncomeType.deleteMany;
    const originalPaymentDeleteMany = PaymentMode.deleteMany;
    const originalBranchDeleteMany = Branch.deleteMany;
    const uploadedPhoto = await saveProfilePhoto({
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    const deletionOrder = [];
    const user = { id: 'test-user-id', profilePhoto: uploadedPhoto.path };

    User.findById = async (id) => {
        assert.equal(id, 'test-user-id');
        return user;
    };
    RefreshToken.deleteMany = async (filter) => {
        assert.equal(filter.userId, 'test-user-id');
        deletionOrder.push('refreshTokens');
        return { deletedCount: 1 };
    };
    Transaction.deleteMany = async (filter) => {
        assert.equal(filter.userId, 'test-user-id');
        deletionOrder.push('transactions');
        return { deletedCount: 0 };
    };
    ExpenseType.deleteMany = async (filter) => {
        assert.equal(filter.userId, 'test-user-id');
        deletionOrder.push('expenseTypes');
        return { deletedCount: 0 };
    };
    IncomeType.deleteMany = async (filter) => {
        assert.equal(filter.userId, 'test-user-id');
        deletionOrder.push('incomeTypes');
        return { deletedCount: 0 };
    };
    PaymentMode.deleteMany = async (filter) => {
        assert.equal(filter.userId, 'test-user-id');
        deletionOrder.push('paymentModes');
        return { deletedCount: 0 };
    };
    Branch.deleteMany = async (filter) => {
        assert.equal(filter.userId, 'test-user-id');
        deletionOrder.push('branches');
        return { deletedCount: 1 };
    };
    User.findByIdAndDelete = async (id) => {
        assert.equal(id, 'test-user-id');
        deletionOrder.push('user');
        return user;
    };

    const accessToken = jwt.sign({ branchId: '64b0000000000000000000b1', role: 'admin' }, config.JWT_SECRET, {
        subject: 'test-user-id',
        issuer: 'kharcha-book-api',
        audience: 'kharcha-book-client',
        expiresIn: '1h',
        algorithm: 'HS256',
    });

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/deleteAccount`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${accessToken}` },
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.message, 'Account deleted successfully');
        assert.match(response.headers.get('set-cookie'), /refreshToken=;/i);
        assert.deepEqual(
            deletionOrder.sort(),
            ['branches', 'expenseTypes', 'incomeTypes', 'paymentModes', 'refreshTokens', 'transactions', 'user'].sort(),
        );

        const photoResponse = await fetch(`${baseUrl}${uploadedPhoto.path}`);
        assert.equal(photoResponse.status, 404);
    } finally {
        User.findById = originalFindById;
        User.findByIdAndDelete = originalFindByIdAndDelete;
        RefreshToken.deleteMany = originalDeleteMany;
        Transaction.deleteMany = originalTransactionDeleteMany;
        ExpenseType.deleteMany = originalExpenseDeleteMany;
        IncomeType.deleteMany = originalIncomeDeleteMany;
        PaymentMode.deleteMany = originalPaymentDeleteMany;
        Branch.deleteMany = originalBranchDeleteMany;
        await deleteProfilePhoto(uploadedPhoto.path);
    }
});

test('login rejects unknown branches and incorrect passwords with the same response', async () => {
    const restoreLogin = await mockBranchLogin();

    try {
        const wrongPasswordResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ phoneNumber: '+919876543210', password: '4321' }),
        });
        const wrongPasswordBody = await wrongPasswordResponse.json();

        Branch.findOne = () => ({ select: async () => null });
        const unknownBranchResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ phoneNumber: '+919876543210', password: '4321' }),
        });
        const unknownBranchBody = await unknownBranchResponse.json();

        assert.equal(wrongPasswordResponse.status, 401);
        assert.equal(unknownBranchResponse.status, 401);
        assert.equal(wrongPasswordBody.message, unknownBranchBody.message);
    } finally {
        restoreLogin();
    }
});

test('authentication middleware verifies bearer tokens and sets the request user', () => {
    const token = jwt.sign({ branchId: '64b0000000000000000000b1', role: 'admin' }, config.JWT_SECRET, {
        subject: 'authenticated-user-id',
        issuer: 'kharcha-book-api',
        audience: 'kharcha-book-client',
        expiresIn: '1h',
        algorithm: 'HS256',
    });
    const req = { headers: { authorization: `Bearer ${token}` } };
    let nextError;
    let nextCalled = false;

    authenticate(req, {}, (error) => {
        nextError = error;
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(nextError, undefined);
    assert.deepEqual(req.user, {
        id: 'authenticated-user-id',
        branchId: '64b0000000000000000000b1',
        role: 'admin',
    });
});

test('authentication middleware rejects missing and invalid bearer tokens', () => {
    const tokenWithoutBranch = jwt.sign({}, config.JWT_SECRET, {
        subject: 'authenticated-user-id',
        issuer: 'kharcha-book-api',
        audience: 'kharcha-book-client',
        expiresIn: '1h',
        algorithm: 'HS256',
    });
    for (const authorization of [undefined, 'Bearer not-a-valid-token', `Bearer ${tokenWithoutBranch}`]) {
        const req = { headers: { authorization } };
        let nextError;

        authenticate(req, {}, (error) => {
            nextError = error;
        });

        assert.equal(nextError.statusCode, 401);
    }
});

const registrationInput = {
    fullName: 'Test User',
    phoneNumber: '+919876543210',
    email: 'TEST@example.com',
    gender: 'prefer not to say',
    dob: '1990-01-01',
    password: '1234',
    accountType: 'self',
    address: {
        line1: '12 MG Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001',
    },
};

test('registration validates required fields before database access', async () => {
    for (const password of ['123', '12345', '12a4']) {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...registrationInput, password }),
        });
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.success, false);
        assert.doesNotMatch(JSON.stringify(body), new RegExp(password));
    }
});

test('registration rejects invalid or future dates of birth', async () => {
    for (const dob of ['2000-02-30', '2999-01-01']) {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...registrationInput, dob }),
        });

        assert.equal(response.status, 400);
    }
});

test('registration creates an account with a hashed password and safe response', async () => {
    const originalFindOne = User.findOne;
    const originalCreate = User.create;
    const originalUpdateOne = User.updateOne;
    const originalBranchCreate = Branch.create;
    let savedUser;
    let savedBranch;
    let defaultBranchUpdate;

    User.findOne = () => ({ select: async () => null });
    User.updateOne = async (filter, update) => {
        defaultBranchUpdate = { filter, update };
        return { modifiedCount: 1 };
    };
    Branch.create = async (input) => {
        savedBranch = input;
        return { id: 'branch-id', _id: 'branch-id', ...input };
    };
    User.create = async (input) => {
        savedUser = input;
        return {
            id: 'user-id',
            ...input,
            dob: new Date(`${input.dob}T00:00:00.000Z`),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
        };
    };

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(registrationInput),
        });
        const body = await response.json();

        assert.equal(response.status, 201);
        assert.equal(body.success, true);
        assert.equal(body.data.email, 'test@example.com');
        assert.equal(body.data.phoneNumber, registrationInput.phoneNumber);
        assert.equal(body.data.passwordHash, undefined);
        assert.equal(savedUser.passwordHash, undefined);
        assert.equal(savedBranch.passwordHash.startsWith('scrypt$'), true);
        assert.notEqual(savedBranch.passwordHash, registrationInput.password);
        assert.equal(savedBranch.role, 'admin');
        assert.equal(savedBranch.userId, 'user-id');
        assert.equal(savedBranch.name, 'Test User');
        assert.equal(savedBranch.phoneNumber, registrationInput.phoneNumber);
        assert.equal(savedBranch.email, 'test@example.com');
        assert.deepEqual(savedBranch.address, registrationInput.address);
        assert.equal(savedUser.accountType, 'self');
        assert.equal(savedUser.organisationName, null);
        assert.deepEqual(defaultBranchUpdate, {
            filter: { _id: 'user-id', defaultBranchId: null },
            update: { $set: { defaultBranchId: 'branch-id' } },
        });
        assert.equal(body.data.defaultBranchId, 'branch-id');
    } finally {
        User.findOne = originalFindOne;
        User.create = originalCreate;
        User.updateOne = originalUpdateOne;
        Branch.create = originalBranchCreate;
    }
});

test('user profile photo path is optional', async () => {
    const userWithoutPhoto = new User({
        fullName: 'Test User',
        phoneNumber: '+919876543210',
        email: 'test@example.com',
        gender: 'prefer not to say',
        dob: new Date('1990-01-01T00:00:00.000Z'),
    });
    const userWithPhoto = new User({
        fullName: 'Test User',
        phoneNumber: '+919876543211',
        email: 'photo@example.com',
        gender: 'prefer not to say',
        dob: new Date('1990-01-01T00:00:00.000Z'),
        profilePhoto: 'uploads/profile-photos/user-photo.jpg',
    });

    await userWithoutPhoto.validate();
    assert.equal(userWithoutPhoto.profilePhoto, null);
    assert.equal(userWithoutPhoto.toObject().profilePhoto, null);
    await userWithPhoto.validate();
    assert.equal(userWithPhoto.profilePhoto, 'uploads/profile-photos/user-photo.jpg');
});

test('registration rejects duplicate email or phone number', async () => {
    const originalFindOne = User.findOne;
    const originalCreate = User.create;
    User.findOne = () => ({ select: async () => ({ _id: 'existing-user' }) });
    User.create = async () => {
        throw new Error('Should not create a duplicate user.');
    };

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(registrationInput),
        });

        assert.equal(response.status, 409);
    } finally {
        User.findOne = originalFindOne;
        User.create = originalCreate;
    }
});

test('global error handler maps duplicate-key races without exposing database details', async () => {
    const originalFindOne = User.findOne;
    const originalCreate = User.create;
    User.findOne = () => ({ select: async () => null });
    User.create = async () => {
        const error = new Error('duplicate key: private@example.com');
        error.code = 11000;
        error.keyValue = { email: 'private@example.com' };
        throw error;
    };

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(registrationInput),
        });
        const body = await response.json();

        assert.equal(response.status, 409);
        assert.equal(body.message, 'A record with one or more of these details already exists.');
        assert.doesNotMatch(JSON.stringify(body), /private@example\.com/);
    } finally {
        User.findOne = originalFindOne;
        User.create = originalCreate;
    }
});

test('global error handler hides unexpected database errors', async () => {
    const originalFindOne = User.findOne;
    const originalConsoleError = console.error;
    User.findOne = () => ({
        select: async () => {
            throw new Error('database credentials must stay private');
        },
    });
    console.error = () => {};

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(registrationInput),
        });
        const body = await response.json();

        assert.equal(response.status, 500);
        assert.equal(body.message, 'Internal server error');
        assert.doesNotMatch(JSON.stringify(body), /database credentials/);
    } finally {
        User.findOne = originalFindOne;
        console.error = originalConsoleError;
    }
});

test('global error handler returns a safe response for malformed JSON', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"fullName":',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.message, 'Invalid JSON request body.');
});

test('unknown routes return a consistent 404 response', async () => {
    const response = await fetch(`${baseUrl}/api/not-a-route`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
});

test('validation errors do not include submitted field values', () => {
    let validationError;
    const middleware = validate(z.object({ password: z.string().min(8) }));

    middleware({ body: { password: 'secret' } }, {}, (error) => {
        validationError = error;
    });

    assert.equal(validationError.statusCode, 400);
    assert.doesNotMatch(JSON.stringify(validationError.details), /secret/);
});

const branchAccessToken = () => jwt.sign({ branchId: '64b0000000000000000000b1', role: 'admin' }, config.JWT_SECRET, {
    subject: '64b000000000000000000001',
    issuer: 'kharcha-book-api',
    audience: 'kharcha-book-client',
    expiresIn: '1h',
    algorithm: 'HS256',
});

const branchUserToken = () => jwt.sign({ branchId: '64b0000000000000000000b2', role: 'user' }, config.JWT_SECRET, {
    subject: '64b000000000000000000001',
    issuer: 'kharcha-book-api',
    audience: 'kharcha-book-client',
    expiresIn: '1h',
    algorithm: 'HS256',
});

test('admin sees every branch while a branch user sees only their own', async () => {
    const originalFindById = User.findById;
    const originalBranchFind = Branch.find;
    const branchFilters = [];
    User.findById = () => ({ select: async () => ({ defaultBranchId: '64b0000000000000000000b1' }) });
    Branch.find = (filter) => {
        branchFilters.push(filter);
        return { sort: async () => [] };
    };

    try {
        await fetch(`${baseUrl}/api/v1/branches`, {
            headers: { authorization: `Bearer ${branchAccessToken()}` },
        });
        await fetch(`${baseUrl}/api/v1/branches`, {
            headers: { authorization: `Bearer ${branchUserToken()}` },
        });

        assert.deepEqual(branchFilters, [
            { userId: '64b000000000000000000001' },
            { userId: '64b000000000000000000001', _id: '64b0000000000000000000b2' },
        ]);
    } finally {
        User.findById = originalFindById;
        Branch.find = originalBranchFind;
    }
});

test('branch users cannot use admin-only routes or other branches', async () => {
    const headers = {
        authorization: `Bearer ${branchUserToken()}`,
        'content-type': 'application/json',
    };
    const requests = [
        ['POST', '/api/v1/branches', { name: 'New' }],
        ['DELETE', '/api/v1/branches/64b0000000000000000000b2'],
        ['PATCH', '/api/v1/branches/64b0000000000000000000b1', { name: 'Other' }],
        ['PATCH', '/api/v1/branches/64b0000000000000000000b2/default'],
        ['POST', '/api/v1/transactions/expense-types', { name: 'Food' }],
        ['PUT', '/api/v1/users/profile', { fullName: 'Someone' }],
        ['DELETE', '/api/v1/auth/deleteAccount'],
        ['GET', '/api/v1/transactions?branchId=64b0000000000000000000b1'],
    ];

    for (const [method, path, body] of requests) {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers,
            body: body && JSON.stringify(body),
        });
        assert.equal(response.status, 403, `${method} ${path}`);
    }
});

test('branch user transactions are locked to their own branch', async () => {
    const originalFind = Transaction.find;
    let transactionFilter;
    Transaction.find = (filter) => {
        transactionFilter = filter;
        return { sort: async () => [] };
    };

    try {
        const response = await fetch(`${baseUrl}/api/v1/transactions`, {
            headers: { authorization: `Bearer ${branchUserToken()}` },
        });

        assert.equal(response.status, 200);
        assert.equal(transactionFilter.branchId, '64b0000000000000000000b2');
    } finally {
        Transaction.find = originalFind;
    }
});

test('user can create additional branches', async () => {
    const originalFindById = User.findById;
    const originalBranchCreate = Branch.create;
    let savedBranch;
    User.findById = () => ({ select: async () => ({ defaultBranchId: '64b0000000000000000000b1' }) });
    Branch.create = async (input) => {
        savedBranch = input;
        return { id: '64b0000000000000000000b2', _id: '64b0000000000000000000b2', description: '', ...input };
    };

    try {
        const response = await fetch(`${baseUrl}/api/v1/branches`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${branchAccessToken()}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Jaipur Shop',
                phoneNumber: '+919876543299',
                password: '5678',
                address: { line1: '5 Station Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302006' },
            }),
        });
        const body = await response.json();

        assert.equal(response.status, 201);
        assert.equal(body.data.name, 'Jaipur Shop');
        assert.equal(body.data.isDefault, false);
        assert.equal(body.data.address.city, 'Jaipur');
        assert.equal(savedBranch.userId, '64b000000000000000000001');
        assert.equal(savedBranch.phoneNumber, '+919876543299');
        assert.equal(savedBranch.password, undefined);
        assert.equal(savedBranch.passwordHash.startsWith('scrypt$'), true);
        assert.equal(body.data.passwordHash, undefined);
    } finally {
        User.findById = originalFindById;
        Branch.create = originalBranchCreate;
    }
});

test('default branch cannot be deleted', async () => {
    const originalFindById = User.findById;
    const originalBranchFindOne = Branch.findOne;
    User.findById = () => ({ select: async () => ({ defaultBranchId: '64b0000000000000000000b1' }) });
    Branch.findOne = async () => ({ id: '64b0000000000000000000b1', _id: '64b0000000000000000000b1' });

    try {
        const response = await fetch(`${baseUrl}/api/v1/branches/64b0000000000000000000b1`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${branchAccessToken()}` },
        });

        assert.equal(response.status, 409);
    } finally {
        User.findById = originalFindById;
        Branch.findOne = originalBranchFindOne;
    }
});

test('transactions reject a branch owned by another user', async () => {
    const originalBranchExists = Branch.exists;
    Branch.exists = async () => null;

    try {
        const response = await fetch(`${baseUrl}/api/v1/transactions?branchId=64b0000000000000000000b9`, {
            headers: { authorization: `Bearer ${branchAccessToken()}` },
        });
        const body = await response.json();

        assert.equal(response.status, 400);
        assert.equal(body.message, 'Branch does not belong to the authenticated user.');
    } finally {
        Branch.exists = originalBranchExists;
    }
});

test('business registration requires an organisation name and uses it for the default branch', async () => {
    const missingName = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...registrationInput, accountType: 'business' }),
    });
    const missingNameBody = await missingName.json();
    assert.equal(missingName.status, 400);
    assert.deepEqual(missingNameBody.details.map(({ path }) => path), [['organisationName']]);

    const selfWithName = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...registrationInput, organisationName: 'Acme Traders' }),
    });
    assert.equal(selfWithName.status, 400);

    const missingAddress = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...registrationInput, address: undefined }),
    });
    assert.equal(missingAddress.status, 400);

    const originalFindOne = User.findOne;
    const originalCreate = User.create;
    const originalUpdateOne = User.updateOne;
    const originalBranchCreate = Branch.create;
    let savedBranch;
    User.findOne = () => ({ select: async () => null });
    User.create = async (input) => ({ id: 'user-id', ...input });
    User.updateOne = async () => ({ modifiedCount: 1 });
    Branch.create = async (input) => {
        savedBranch = input;
        return { id: 'branch-id', _id: 'branch-id', ...input };
    };

    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                ...registrationInput,
                accountType: 'business',
                organisationName: 'Acme Traders',
            }),
        });
        const body = await response.json();

        assert.equal(response.status, 201);
        assert.equal(body.data.accountType, 'business');
        assert.equal(body.data.organisationName, 'Acme Traders');
        assert.equal(savedBranch.name, 'Acme Traders');
        assert.deepEqual(savedBranch.address, registrationInput.address);
    } finally {
        User.findOne = originalFindOne;
        User.create = originalCreate;
        User.updateOne = originalUpdateOne;
        Branch.create = originalBranchCreate;
    }
});
