const { S3Client } = require('@aws-sdk/client-s3');

const s3Config = {
    region: process.env.AWS_REGION || 'ap-south-1',
};

// Only add credentials object if both keys are provided
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3Config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
}

const s3Client = new S3Client(s3Config);
const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME || 'techastra-hms-storage-948201';

module.exports = { s3Client, S3_BUCKET };
