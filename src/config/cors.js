import config from "./config.js";

const allowedOrigins = new Set(config.CORS_ORIGINS);

const corsOptions = {
  origin: function (origin, callback) {
    return callback(null, !origin || allowedOrigins.has(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};

export default corsOptions;
