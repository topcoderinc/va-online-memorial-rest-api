'use strict';

/*
 * Copyright (c) 2018 Topcoder, Inc. All rights reserved.
 */

const S3 = require('aws-sdk/clients/s3');
const uuidv4 = require('uuid/v4');

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

function* uploadFile(file) {
  const name = uuidv4();
  const params = {
    Key: `uploads/${name}`,
    Body: file.buffer,
    ContentType: file.mimetype
  };

  yield s3Client.putObject(params).promise();
  return {
    mimeType: file.mimetype,
    name: name,
    url: fileUrl(name)
  };
}

module.exports = {
  s3Client,
  uploadFile
};
