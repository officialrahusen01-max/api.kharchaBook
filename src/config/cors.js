const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:2000',
            'http://localhost:3000',
            'http://localhost:3001',
        ];

        return callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS',
    ],
};

export default corsOptions;
