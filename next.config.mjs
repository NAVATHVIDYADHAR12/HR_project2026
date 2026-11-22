/** @type {import('next').NextConfig} */
export default {
  // Server libraries load from node_modules as-is (pdfkit/pdf-parse read their own data files).
  serverExternalPackages: ['express', 'multer', 'exceljs', 'pdfkit', 'pdf-parse', 'mammoth', 'nodemailer', 'jszip'],
  // Files the API reads at runtime that a bundler can't see.
  outputFileTracingIncludes: { '/api/[...path]': ['./extension/**/*', './node_modules/pdfkit/js/data/**/*'] },
}
