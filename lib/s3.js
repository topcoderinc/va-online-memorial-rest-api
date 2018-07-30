'use strict';

/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

const S3 = require('aws-sdk/clients/s3');

const BucketName = process.env.AWS_BUCKET_NAME;
const Region = process.env.AWS_REGION;
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
};

const s3Client = new S3({
  apiVersion: '2006-03-01',
  region: Region,
  credentials: credentials,
  params: {
    Bucket: BucketName
  }
});

function fileUrl(fileName) {
  return `https://s3.${Region}.amazonaws.com/${BucketName}/uploads/${fileName}`
}

function* uploadFile(file, name) {
  const params = {
    Key: `uploads/${name}`,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  };

  yield s3Client.putObject(params).promise();
}

function* deleteFile(key) {
  s3Client.deleteObject({ Key: `uploads/${key}` }).promise();
}

module.exports = {
  deleteFile,
  fileUrl,
  s3Client,
  uploadFile
};
