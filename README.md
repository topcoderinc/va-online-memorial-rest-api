# VA ONLINE MEMORIAL - REST API

## Dependencies
-   [Nodejs](https://nodejs.org/en/)
-   [PostgreSQL](https://www.postgresql.org/)
-   [Express](https://expressjs.com/)
-   [eslint](http://eslint.org/)
-   [Postman](https://www.getpostman.com/) for verification.

## Configuration
-   Edit configuration in `config/default.json` and
-   custom environment variables names in `config/custom-environment-variables.json`,

## Application constants

-   Application constants can be configured in `./constants.js`

## Local Deployment

*Before starting the application, make sure that PostgreSQL is running and you have configured everything correctly in `config/default.json`*

-   Install dependencies `npm i`
-   Run lint check `npm run lint`
-   Initialize database data `npm run init-data`
-   Start the REST API `npm start`.

## Postman Verification

-   To verify the REST API, you can import the collection & environment from `/docs` in [Postman](https://www.getpostman.com/)

## Uploaded File Storage

Depending on the `NODE_ENV` environment variable, the app will either use local file storage or AWS S3 storage.

Setting `NODE_ENV=production` will utilize S3 while other values (the app's default is `development`) will store the files in `./public/upload/`

Files uploaded to S3 are readable by the Public, which we may want to change in the future so that only photos are Public while Next of Kin proof uploads are restricted and proxied through the server for download by those who have Admin access.

### Requirements for using AWS S3

An S3 bucket is required along with an IAM user. You will need to add the user's `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY` to process environment variables as described in the following section.

Files are uploaded with the prefix `uploads` (essentially creating a subdirectory). 

At a minimum, the IAM user will need a security policy that includes `DeleteObject, GetObject, PutObject, PutObjectACL`.

#### Sample IAM Policy
```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::<bucket-name>"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:DeleteObject",
                "s3:GetObject",
                "s3:PutObject",
                "s3:PutObjectACL"
            ],
            "Resource": [
                "arn:aws:s3:::<bucket-name>/*",
                "arn:aws:s3:::<bucket-name>/uploads/*"
            ]
        }
    ]
}
```

### Setting environment variables for AWS S3

This project uses [dotenv](https://github.com/motdotla/dotenv) to load environment-specific variables.
Never check the `.env` file into the repository. It is listed in the project's `.gitignore`.

The following variables are required to configure S3:

```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_BUCKET_NAME=
AWS_REGION=
```
