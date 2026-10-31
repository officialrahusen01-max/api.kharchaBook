const masterApiPaths = (path, label) => ({
    [`/api/v1/transactions/${path}`]: {
        get: {
            tags: ['Transactions'],
            summary: `List current user ${path}`,
            security: [{ bearerAuth: [] }],
            responses: { 200: { description: `${label} list retrieved.` } },
        },
        post: {
            tags: ['Transactions'],
            summary: `Create a ${label.toLowerCase()}`,
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: { 'application/json': { schema: { $ref: '#/components/schemas/MasterWrite' } } },
            },
            responses: { 201: { description: `${label} created.` } },
        },
    },
    [`/api/v1/transactions/${path}/{id}`]: {
        patch: {
            tags: ['Transactions'],
            summary: `Update a ${label.toLowerCase()}`,
            security: [{ bearerAuth: [] }],
            parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
            requestBody: {
                required: true,
                content: { 'application/json': { schema: { $ref: '#/components/schemas/MasterPatch' } } },
            },
            responses: { 200: { description: `${label} updated.` }, 404: { description: 'Not found.' } },
        },
        delete: {
            tags: ['Transactions'],
            summary: `Delete an unused ${label.toLowerCase()}`,
            security: [{ bearerAuth: [] }],
            parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
            responses: { 200: { description: `${label} deleted.` }, 409: { description: 'Record is used by transactions.' } },
        },
    },
});

const branchApiPaths = {
    '/api/v1/branches': {
        get: {
            tags: ['Branches'],
            summary: 'List current user branches',
            security: [{ bearerAuth: [] }],
            responses: { 200: { description: 'Branch list retrieved.' } },
        },
        post: {
            tags: ['Branches'],
            summary: 'Create a branch with its own login (admin only)',
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: { 'application/json': { schema: { $ref: '#/components/schemas/BranchWrite' } } },
            },
            responses: { 201: { description: 'Branch created.' }, 409: { description: 'Branch name already exists.' } },
        },
    },
    '/api/v1/branches/{id}': {
        patch: {
            tags: ['Branches'],
            summary: 'Update a branch (branch users: own branch only, no role change)',
            security: [{ bearerAuth: [] }],
            parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
            requestBody: {
                required: true,
                content: { 'application/json': { schema: { $ref: '#/components/schemas/BranchPatch' } } },
            },
            responses: { 200: { description: 'Branch updated.' }, 404: { description: 'Not found.' } },
        },
        delete: {
            tags: ['Branches'],
            summary: 'Delete a non-default branch without transactions (admin only)',
            security: [{ bearerAuth: [] }],
            parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
            responses: { 200: { description: 'Branch deleted.' }, 409: { description: 'Branch is default or has transactions.' } },
        },
    },
    '/api/v1/branches/{id}/default': {
        patch: {
            tags: ['Branches'],
            summary: 'Make a branch the default (admin only)',
            security: [{ bearerAuth: [] }],
            parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
            responses: { 200: { description: 'Default branch updated.' }, 404: { description: 'Not found.' } },
        },
    },
};

const transactionApiPaths = {
    '/api/v1/transactions': {
        get: {
            tags: ['Transactions'],
            summary: 'List branch transactions, optionally filtered by month',
            security: [{ bearerAuth: [] }],
            parameters: [{
                in: 'query',
                name: 'branchId',
                required: false,
                description: 'Defaults to the user default branch.',
                schema: { type: 'string', pattern: '^[\\da-f]{24}$' },
            }, {
                in: 'query',
                name: 'month',
                required: false,
                schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', example: '2026-10' },
            }],
            responses: { 200: { description: 'Transactions retrieved.' } },
        },
        post: {
            tags: ['Transactions'],
            summary: 'Create an income or expense transaction',
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: { 'application/json': { schema: { $ref: '#/components/schemas/TransactionWrite' } } },
            },
            responses: { 201: { description: 'Transaction created.' } },
        },
    },
    '/api/v1/transactions/{id}': {
        patch: {
            tags: ['Transactions'],
            summary: 'Update a transaction',
            security: [{ bearerAuth: [] }],
            parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
            requestBody: {
                required: true,
                content: { 'application/json': { schema: { $ref: '#/components/schemas/TransactionPatch' } } },
            },
            responses: { 200: { description: 'Transaction updated.' }, 404: { description: 'Not found.' } },
        },
        delete: {
            tags: ['Transactions'],
            summary: 'Delete a transaction',
            security: [{ bearerAuth: [] }],
            parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
            responses: { 200: { description: 'Transaction deleted.' }, 404: { description: 'Not found.' } },
        },
    },
    '/api/v1/transactions/summary': {
        get: {
            tags: ['Transactions'],
            summary: 'Get branch monthly totals and all-time balance',
            security: [{ bearerAuth: [] }],
            parameters: [{
                in: 'query',
                name: 'branchId',
                required: false,
                description: 'Defaults to the user default branch.',
                schema: { type: 'string', pattern: '^[\\da-f]{24}$' },
            }, {
                in: 'query',
                name: 'month',
                required: false,
                schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', example: '2026-10' },
            }],
            responses: { 200: { description: 'Monthly and all-time totals retrieved.' } },
        },
    },
};

const openApiDocument = {
    openapi: '3.0.3',
    info: {
        title: 'Kharcha Book API',
        version: '1.0.0',
        description: 'API documentation for the Kharcha Book service.',
    },
    servers: [{ url: '/', description: 'Current server' }],
    tags: [
        { name: 'Health' },
        { name: 'Auth' },
        { name: 'Users' },
        { name: 'Branches' },
        { name: 'Transactions' },
    ],
    paths: {
        '/health': {
            get: {
                tags: ['Health'],
                summary: 'Check API health',
                responses: {
                    200: {
                        description: 'The API is healthy.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/HealthResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/api/v1/auth/register': {
            post: {
                tags: ['Auth'],
                summary: 'Register a user',
                description: 'Creates the account immediately. OTP verification is a separate, not-yet-implemented flow.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/RegisterRequest' },
                            example: {
                                fullName: 'Rahul Kumar',
                                phoneNumber: '+919876543210',
                                email: 'rahul@example.com',
                                gender: 'male',
                                dob: '1998-05-20',
                                password: '1234',
                                accountType: 'business',
                                organisationName: 'Acme Traders',
                                address: {
                                    line1: '12 MG Road',
                                    city: 'Jaipur',
                                    state: 'Rajasthan',
                                    pincode: '302001',
                                },
                            },
                        },
                    },
                },
                responses: {
                    201: {
                        description: 'Account created.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/RegisterResponse' },
                            },
                        },
                    },
                    400: {
                        description: 'Invalid request data.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    409: {
                        description: 'The email or phone number is already registered.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    413: {
                        description: 'Request body exceeds the 10 KB limit.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    429: {
                        description: 'Too many requests.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    500: {
                        description: 'Unexpected server error.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/api/v1/auth/login': {
            post: {
                tags: ['Auth'],
                summary: 'Log in to a branch with its phone number and 4-digit password',
                description: 'Use X-Refresh-Token-Transport: cookie for web clients, or body for mobile clients. Defaults to body.',
                parameters: [{
                    in: 'header',
                    name: 'X-Refresh-Token-Transport',
                    required: false,
                    schema: { type: 'string', enum: ['cookie', 'body'], default: 'body' },
                }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/LoginRequest' },
                            example: {
                                phoneNumber: '+919876543210',
                                password: '1234',
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Login successful; returns a one-hour Bearer access token.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/LoginResponse' },
                            },
                        },
                    },
                    400: {
                        description: 'Invalid request data.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    401: {
                        description: 'Invalid phone number or password.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    429: {
                        description: 'Too many requests.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/api/v1/auth/refresh': {
            post: {
                tags: ['Auth'],
                summary: 'Refresh access and refresh tokens',
                description: 'Accepts refreshToken in the JSON request body for mobile clients or the refreshToken HttpOnly cookie for web clients. Every successful request rotates the refresh token.',
                requestBody: {
                    required: false,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['refreshToken'],
                                properties: { refreshToken: { type: 'string' } },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Tokens refreshed successfully.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/RefreshResponse' },
                            },
                        },
                    },
                    401: {
                        description: 'Refresh token is missing, invalid, expired, or already rotated.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/api/v1/auth/logout': {
            post: {
                tags: ['Auth'],
                summary: 'Revoke the current refresh token',
                description: 'Accepts refreshToken in the JSON request body for mobile clients or the refreshToken HttpOnly cookie for web clients.',
                requestBody: {
                    required: false,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                additionalProperties: false,
                                properties: { refreshToken: { type: 'string' } },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Logged out successfully.' },
                },
            },
        },
        '/api/v1/users/profile': {
            get: {
                tags: ['Users'],
                summary: 'Get the authenticated user profile',
                security: [{ bearerAuth: [] }],
                responses: {
                    200: {
                        description: 'Profile retrieved successfully.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ProfileResponse' },
                            },
                        },
                    },
                    401: {
                        description: 'Authentication is required.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
            put: {
                tags: ['Users'],
                summary: 'Update the authenticated user profile fields',
                description: 'Updates profile fields only. Use /api/v1/users/profile/photo to upload a profile photo.',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/ProfileUpdate' },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Profile updated successfully.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ProfileResponse' },
                            },
                        },
                    },
                    400: {
                        description: 'Invalid profile fields.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    401: {
                        description: 'Authentication is required.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    409: {
                        description: 'Email or phone number is already in use.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        '/api/v1/users/profile/photo': {
            patch: {
                tags: ['Users'],
                summary: 'Update the authenticated user profile photo',
                description: 'Upload a JPEG, PNG, or WebP image as profilePhoto (maximum 5 MB).',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'multipart/form-data': {
                            schema: {
                                type: 'object',
                                required: ['profilePhoto'],
                                properties: {
                                    profilePhoto: { type: 'string', format: 'binary' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Profile photo updated successfully.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ProfileResponse' },
                            },
                        },
                    },
                    400: {
                        description: 'Invalid or missing image upload.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                    401: {
                        description: 'Authentication is required.',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/ErrorResponse' },
                            },
                        },
                    },
                },
            },
        },
        ...branchApiPaths,
        ...masterApiPaths('expense-types', 'Expense type'),
        ...masterApiPaths('income-types', 'Income type'),
        ...masterApiPaths('payment-modes', 'Payment mode'),
        ...transactionApiPaths,
    },
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
        },
        schemas: {
Address: {
                type: 'object',
                additionalProperties: false,
                required: ['line1', 'city', 'state', 'pincode'],
                properties: {
                    line1: { type: 'string', maxLength: 200, example: '12 MG Road' },
                    line2: { type: 'string', maxLength: 200 },
                    city: { type: 'string', maxLength: 80, example: 'Jaipur' },
                    state: { type: 'string', maxLength: 80, example: 'Rajasthan' },
                    pincode: { type: 'string', pattern: '^[A-Za-z0-9 -]{3,10}$', example: '302001' },
                    country: { type: 'string', maxLength: 80, default: 'India' },
                },
            },
            BranchWrite: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'phoneNumber', 'password', 'address'],
                properties: {
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    description: { type: 'string', maxLength: 200 },
                    phoneNumber: { type: 'string', pattern: '^\\+?[1-9]\\d{6,14}$' },
                    password: { type: 'string', format: 'password', pattern: '^[0-9]{4}$', writeOnly: true },
                    role: { type: 'string', enum: ['admin', 'user'] },
                    email: { type: 'string', format: 'email', maxLength: 254 },
                    address: { $ref: '#/components/schemas/Address' },
                },
            },
            BranchPatch: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    description: { type: 'string', maxLength: 200 },
                    phoneNumber: { type: 'string', pattern: '^\\+?[1-9]\\d{6,14}$' },
                    password: { type: 'string', format: 'password', pattern: '^[0-9]{4}$', writeOnly: true },
                    role: { type: 'string', enum: ['admin', 'user'] },
                    email: { type: 'string', format: 'email', maxLength: 254 },
                    address: { $ref: '#/components/schemas/Address' },
                },
            },
            MasterWrite: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    description: { type: 'string', maxLength: 200 },
                },
                required: ['name'],
            },
            MasterPatch: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                    name: { type: 'string', minLength: 1, maxLength: 80 },
                    description: { type: 'string', maxLength: 200 },
                },
            },
            TransactionWrite: {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'paymentModeId', 'amount', 'transactionDate'],
                properties: {
                    branchId: {
                        type: 'string',
                        pattern: '^[\\da-f]{24}$',
                        description: 'Defaults to the user default branch.',
                    },
                    type: { type: 'string', enum: ['income', 'expense'] },
                    expenseTypeId: { type: 'string', pattern: '^[\\da-f]{24}$' },
                    incomeTypeId: { type: 'string', pattern: '^[\\da-f]{24}$' },
                    paymentModeId: { type: 'string', pattern: '^[\\da-f]{24}$' },
                    amount: { type: 'number', exclusiveMinimum: 0, multipleOf: 0.01, example: 120.5 },
                    transactionDate: { type: 'string', format: 'date-time' },
                    note: { type: 'string', maxLength: 500 },
                },
            },
            TransactionPatch: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                    branchId: { type: 'string', pattern: '^[\\da-f]{24}$' },
                    type: { type: 'string', enum: ['income', 'expense'] },
                    expenseTypeId: { type: 'string', pattern: '^[\\da-f]{24}$' },
                    incomeTypeId: { type: 'string', pattern: '^[\\da-f]{24}$' },
                    paymentModeId: { type: 'string', pattern: '^[\\da-f]{24}$' },
                    amount: { type: 'number', exclusiveMinimum: 0, multipleOf: 0.01 },
                    transactionDate: { type: 'string', format: 'date-time' },
                    note: { type: 'string', maxLength: 500 },
                },
            },
            LoginRequest: {
                type: 'object',
                additionalProperties: false,
                required: ['phoneNumber', 'password'],
                properties: {
                    phoneNumber: {
                        type: 'string',
                        pattern: '^\\+?[1-9]\\d{6,14}$',
                        example: '+919876543210',
                    },
                    password: {
                        type: 'string',
                        format: 'password',
                        pattern: '^[0-9]{4}$',
                        minLength: 4,
                        maxLength: 4,
                        writeOnly: true,
                    },
                },
            },
            LoginResponse: {
                type: 'object',
                required: ['success', 'message', 'data'],
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Login successful' },
                    data: {
                        type: 'object',
                        required: ['user', 'accessToken', 'tokenType', 'expiresIn'],
                        properties: {
                            user: { $ref: '#/components/schemas/RegisterResponse/properties/data' },
                            branch: { type: 'object', description: 'The branch that logged in.' },
                            role: { type: 'string', enum: ['admin', 'user'] },
                            accessToken: { type: 'string' },
                            tokenType: { type: 'string', example: 'Bearer' },
                            expiresIn: { type: 'integer', example: 3600 },
                            refreshToken: {
                                type: 'string',
                                description: 'Returned for body transport; cookie transport sets an HttpOnly cookie instead.',
                            },
                        },
                    },
                },
            },
            RefreshResponse: {
                type: 'object',
                required: ['success', 'message', 'data'],
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Token refreshed successfully' },
                    data: {
                        type: 'object',
                        required: ['accessToken', 'tokenType', 'expiresIn'],
                        properties: {
                            accessToken: { type: 'string' },
                            tokenType: { type: 'string', example: 'Bearer' },
                            expiresIn: { type: 'integer', example: 3600 },
                            refreshToken: {
                                type: 'string',
                                description: 'Returned for body transport; cookie transport sets an HttpOnly cookie instead.',
                            },
                        },
                    },
                },
            },
            RegisterRequest: {
                type: 'object',
                additionalProperties: false,
                required: ['fullName', 'phoneNumber', 'email', 'gender', 'dob', 'password', 'accountType', 'address'],
                properties: {
                    fullName: { type: 'string', minLength: 2, maxLength: 100 },
                    phoneNumber: {
                        type: 'string',
                        pattern: '^\\+?[1-9]\\d{6,14}$',
                        example: '+919876543210',
                    },
                    email: { type: 'string', format: 'email', maxLength: 254 },
                    gender: { type: 'string', minLength: 1, maxLength: 30 },
                    dob: {
                        type: 'string',
                        format: 'date',
                        description: 'Must be a past date.',
                    },
                    password: {
                        type: 'string',
                        format: 'password',
                        pattern: '^[0-9]{4}$',
                        minLength: 4,
                        maxLength: 4,
                        writeOnly: true,
                    },
                    accountType: { type: 'string', enum: ['self', 'business'] },
                    organisationName: { type: 'string', minLength: 2, maxLength: 120, description: 'Required when accountType is business.' },
                    address: { $ref: '#/components/schemas/Address' },
                },
            },
            RegisterResponse: {
                type: 'object',
                required: ['success', 'message', 'data'],
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'User registered successfully' },
                    data: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            fullName: { type: 'string' },
                            phoneNumber: { type: 'string' },
                            email: { type: 'string', format: 'email' },
                            gender: { type: 'string' },
                            dob: { type: 'string', format: 'date-time' },
                            accountType: { type: 'string', enum: ['self', 'business'] },
                            organisationName: { type: 'string', minLength: 2, maxLength: 120, description: 'Required when accountType is business.' },
                            address: { $ref: '#/components/schemas/Address' },
                            defaultBranchId: { type: 'string', nullable: true },
                            createdAt: { type: 'string', format: 'date-time' },
                        },
                    },
                    ProfileUpdate: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            fullName: { type: 'string', minLength: 2, maxLength: 100 },
                            phoneNumber: {
                                type: 'string',
                                pattern: '^\\+?[1-9]\\d{6,14}$',
                            },
                            email: { type: 'string', format: 'email', maxLength: 254 },
                            gender: { type: 'string', minLength: 1, maxLength: 30 },
                            dob: {
                                type: 'string',
                                format: 'date',
                                description: 'Must be a past date.',
                            },
                            accountType: { type: 'string', enum: ['self', 'business'] },
                            organisationName: { type: 'string', minLength: 2, maxLength: 120, description: 'Required when accountType is business.' },
                            address: { $ref: '#/components/schemas/Address' },
                        },
                    },
                    ProfileResponse: {
                        type: 'object',
                        required: ['success', 'message', 'data'],
                        properties: {
                            success: { type: 'boolean', example: true },
                            message: { type: 'string' },
                            data: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    fullName: { type: 'string' },
                                    phoneNumber: { type: 'string' },
                                    email: { type: 'string', format: 'email' },
                                    gender: { type: 'string' },
                                    dob: { type: 'string', format: 'date-time' },
                                    accountType: { type: 'string', enum: ['self', 'business'] },
                                    organisationName: { type: 'string', minLength: 2, maxLength: 120, description: 'Required when accountType is business.' },
                                    address: { $ref: '#/components/schemas/Address' },
                                    defaultBranchId: { type: 'string', nullable: true },
                                    profilePhoto: {
                                        type: 'string',
                                        nullable: true,
                                        description: 'Public local URL of the uploaded profile photo.',
                                    },
                                    createdAt: { type: 'string', format: 'date-time' },
                                    updatedAt: { type: 'string', format: 'date-time' },
                                },
                            },
                        },
                    },
                },
            },
            HealthResponse: {
                type: 'object',
                required: ['success', 'message', 'data'],
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Service is healthy' },
                    data: {
                        type: 'object',
                        properties: {
                            status: { type: 'string', example: 'ok' },
                        },
                    },
                },
            },
            ErrorResponse: {
                type: 'object',
                required: ['success', 'message'],
                properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string' },
                    details: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                path: { type: 'array', items: {} },
                                code: { type: 'string' },
                                message: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    },
};

export default openApiDocument;
