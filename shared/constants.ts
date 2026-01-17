// Even if we can technically upload larger files, we don't want to bump this up without showing the user a progress bar or something.
// pretty-bytes formats 1 * 1000 * 1000 as 1MB
export const MAX_FILE_UPLOAD_SIZE = 100 * 1000 * 1000; // 100MB
