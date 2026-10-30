/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const flaskBackendUrl =
      process.env.FLASK_API_URL ||
      'https://attendance-backend-w4ox.onrender.com';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${flaskBackendUrl}/api/v1/:path*`,
      },
      {
        source: '/attendance_photos/:path*',
        destination: `${flaskBackendUrl}/attendance_photos/:path*`,
      },
      {
        source: '/student_image/:id',
        destination: `${flaskBackendUrl}/student_image/:id`,
      },
      {
        source: '/employee_image/:id',
        destination: `${flaskBackendUrl}/employee_image/:id`,
      },
      {
        source: '/admin/payroll-export/csv',
        destination: `${flaskBackendUrl}/admin/payroll-export/csv`,
      },
      {
        source: '/admin/reports/csv',
        destination: `${flaskBackendUrl}/admin/reports/csv`,
      },
    ];
  },
};

export default nextConfig;
