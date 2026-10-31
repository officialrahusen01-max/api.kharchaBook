class ApiResponse {
    constructor(statusCode, data, message = 'Success') {
        this.success = statusCode < 400;
        this.message = message;
        this.data = data;
    }
}

export default ApiResponse;
