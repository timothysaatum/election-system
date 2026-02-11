import { useState, useMemo, useRef } from 'react';
import { Plus, Edit2, Trash2, Upload, Download, FileSpreadsheet, Search, Printer, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { api } from '../services/api';
import { ConfirmModal, AlertModal } from './Modal';
import { ToastContainer } from './Toast';
import { useModal } from '../hooks/useModal';
import { useToast } from '../hooks/useToast';

// Helper function to format student ID for display (convert hyphens to slashes)
const formatStudentId = (studentId) => {
  if (!studentId) return studentId;
  return studentId.replace(/-/g, '/');
};

export const ElectorateManager = ({ electorates, onUpdate }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProgram, setFilterProgram] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [formData, setFormData] = useState({
    student_id: '',
    program: '',
    year_level: 100,
    phone_number: '',
    email: '',
  });

  const confirmModal = useModal();
  const alertModal = useModal();
  const toast = useToast();
  const printRef = useRef();

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    const filteredData = filteredElectorates;

    const htmlContent = `
      <html>
        <head>
          <title>Voters List - Print</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; color: #333; margin-bottom: 20px; }
            .summary { margin-bottom: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; text-left; border-bottom: 1px solid #ddd; }
            th { background-color: #0066cc; color: white; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            tr:hover { background-color: #f0f0f0; }
            .voted { color: green; font-weight: bold; }
            .pending { color: #ff9800; font-weight: bold; }
            .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            .voted-badge { background-color: #e8f5e9; color: #2e7d32; }
            .pending-badge { background-color: #fff3e0; color: #e65100; }
            .token-badge { background-color: #e3f2fd; color: #1565c0; }
            @media print {
              body { margin: 10px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Voters List Report</h1>
          <div class="summary">
            <p><strong>Total Voters:</strong> ${stats.total}</p>
            <p><strong>Voted:</strong> ${stats.voted}</p>
            <p><strong>Tokens Generated:</strong> ${stats.tokenized}</p>
            <p><strong>Pending:</strong> ${stats.total - stats.voted}</p>
            <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Program</th>
                <th>Year Level</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Token</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.map(e => `
                <tr>
                  <td>${formatStudentId(e.student_id) || '-'}</td>
                  <td>${e.name || '-'}</td>
                  <td>${e.program || '-'}</td>
                  <td>${e.year_level || '-'}</td>
                  <td>${e.email || '-'}</td>
                  <td>${e.phone_number || '-'}</td>
                  <td><span class="status-badge ${e.has_voted ? 'voted-badge' : 'pending-badge'}">${e.has_voted ? 'Voted' : 'Pending'}</span></td>
                  <td>${e.voting_token ? '<span class="status-badge token-badge">Generated</span>' : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 250);
    }
  };

  const stats = useMemo(() => {
    const programs = [...new Set(electorates.map(e => e.program).filter(Boolean))];
    return {
      total: electorates.length,
      voted: electorates.filter(e => e.has_voted).length,
      tokenized: electorates.filter(e => e.voting_token).length,
      programs: programs.map(p => ({
        name: p,
        count: electorates.filter(e => e.program === p).length,
        voted: electorates.filter(e => e.program === p && e.has_voted).length,
      })),
      yieldByYear: {
        100: electorates.filter(e => e.year_level === 100).length,
        200: electorates.filter(e => e.year_level === 200).length,
        300: electorates.filter(e => e.year_level === 300).length,
        400: electorates.filter(e => e.year_level === 400).length,
      }
    };
  }, [electorates]);

  const filteredElectorates = useMemo(() =>
    electorates.filter(e =>
      (formatStudentId(e.student_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.name?.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (!filterProgram || e.program === filterProgram)
    ), [electorates, searchTerm, filterProgram]);

  // Pagination calculations
  const totalItems = filteredElectorates.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const paginatedElectorates = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredElectorates.slice(startIndex, endIndex);
  }, [filteredElectorates, currentPage, itemsPerPage]);

  const showingFrom = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(currentPage * itemsPerPage, totalItems);

  // Reset to page 1 when filters change
  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleFilterChange = (value) => {
    setFilterProgram(value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (e) => {
    const newItemsPerPage = parseInt(e.target.value);
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  // Page navigation
  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const goToPreviousPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const goToPage = (page) => setCurrentPage(page);

  // Generate page numbers
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
      let endPage = Math.min(totalPages, startPage + maxVisible - 1);

      if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }

    return pages;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        student_id: formData.student_id,
        program: formData.program,
        year_level: Number(formData.year_level),
      };

      if (formData.phone_number && formData.phone_number.trim() !== '') {
        payload.phone_number = formData.phone_number;
      }

      if (formData.email && formData.email.trim() !== '') {
        payload.email = formData.email;
      }

      if (editingId) {
        await api.updateElectorate(editingId, payload);
      } else {
        await api.createElectorate(payload);
      }
      resetForm();
      onUpdate();

      toast.showSuccess(`Voter ${editingId ? 'updated' : 'created'} successfully`);
    } catch (err) {
      await alertModal.showAlert({
        title: 'Operation Failed',
        message: err.message,
        type: 'error'
      });
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      student_id: '',
      program: '',
      year_level: 100,
      phone_number: '',
      email: '',
    });
  };

  const handleEdit = (electorate) => {
    setFormData({
      student_id: formatStudentId(electorate.student_id),
      program: electorate.program || '',
      year_level: electorate.year_level || 100,
      phone_number: electorate.phone_number || '',
      email: electorate.email || '',
    });
    setEditingId(electorate.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const confirmed = await confirmModal.showConfirm({
      title: 'Delete Voter',
      message: 'Are you sure you want to delete this voter? This action cannot be undone.',
      type: 'danger'
    });

    if (!confirmed) return;

    try {
      await api.deleteElectorate(id);
      onUpdate();
      toast.showSuccess('Voter deleted successfully');
    } catch (err) {
      await alertModal.showAlert({
        title: 'Delete Failed',
        message: err.message,
        type: 'error'
      });
    }
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type - accept Excel AND CSV files
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      await alertModal.showAlert({
        title: 'Invalid File Type',
        message: 'Please select an Excel or CSV file (.xlsx, .xls, or .csv)',
        type: 'error'
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      await alertModal.showAlert({
        title: 'File Too Large',
        message: 'File size must be less than 10MB',
        type: 'error'
      });
      return;
    }

    try {
      setUploading(true);
      setUploadResult(null);

      const result = await api.bulkUploadElectorates(file);

      setUploadResult({
        success: true,
        count: result.length,
        message: `Successfully uploaded ${result.length} voters!`
      });

      onUpdate();

      // Clear file input
      e.target.value = '';

      toast.showSuccess(`Successfully uploaded ${result.length} voters!`);
    } catch (err) {
      setUploadResult({
        success: false,
        message: 'Upload failed: ' + err.message
      });

      await alertModal.showAlert({
        title: 'Upload Failed',
        message: err.message,
        type: 'error'
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    // Create CSV template
    const headers = ['student_id', 'program', 'year_level', 'phone_number', 'email'];
    const sample = ['MLS/0201/19', 'Computer Science', '300', '0244123456', 'student@example.com'];

    const csvContent = [
      headers.join(','),
      sample.join(','),
      // Add a few empty rows for users to fill
      ',,,,'
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voters_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <ConfirmModal {...confirmModal} onConfirm={confirmModal.handleConfirm} onClose={confirmModal.handleClose} {...confirmModal.modalProps} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Voters (Electorates)</h2>
            <p className="text-sm text-gray-600 mt-1">{stats.total} total • {stats.voted} voted ({Math.round(stats.voted / stats.total * 100) || 0}%) • {stats.tokenized} tokenized</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              title="Download Excel Template"
            >
              <Download className="h-5 w-5" />
              Template
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              title="Print Voters List"
            >
              <Printer className="h-5 w-5" />
              Print
            </button>

            <label className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 cursor-pointer transition-colors">
              <Upload className="h-5 w-5" />
              {uploading ? 'Uploading...' : 'Bulk Upload'}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>

            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Add Voter
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-600 font-medium">Total Voters</p>
            <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm text-green-600 font-medium">Voted</p>
            <p className="text-2xl font-bold text-green-900">{stats.voted}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <p className="text-sm text-purple-600 font-medium">Tokens Generated</p>
            <p className="text-2xl font-bold text-purple-900">{stats.tokenized}</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
            <p className="text-sm text-orange-600 font-medium">Pending</p>
            <p className="text-2xl font-bold text-orange-900">{stats.total - stats.voted}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">By Program:</p>
            <div className="flex flex-wrap gap-2">
              {stats.programs.map(p => (
                <div key={p.name} className="px-3 py-2 bg-indigo-50 text-indigo-700 text-xs rounded-full font-medium">
                  {p.name}: {p.count} ({p.voted} voted)
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">By Year Level:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.yieldByYear).map(([year, count]) => count > 0 && (
                <div key={year} className="px-3 py-2 bg-teal-50 text-teal-700 text-xs rounded-full font-medium">
                  Year {year}: {count}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Student ID or Name..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterProgram}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Programs</option>
            {stats.programs.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Upload Result Alert */}
        {uploadResult && (
          <div className={`mb-6 p-4 rounded-lg ${uploadResult.success
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                <span>{uploadResult.message}</span>
              </div>
              <button
                onClick={() => setUploadResult(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Student ID *</label>
                <input
                  type="text"
                  value={formData.student_id}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="MLS/0201/19"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Program *</label>
                <input
                  type="text"
                  value={formData.program}
                  onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Year Level *</label>
                <select
                  value={formData.year_level}
                  onChange={(e) => setFormData({ ...formData, year_level: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={300}>300</option>
                  <option value={400}>400</option>
                  <option value={500}>500</option>
                  <option value={600}>600</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="0244123456"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="student@example.com"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                {editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Program</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedElectorates.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-gray-500">
                    <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>{searchTerm || filterProgram ? 'No voters match your filters' : 'No voters found'}</p>
                  </td>
                </tr>
              )}
              {paginatedElectorates.map((electorate) => (
                <tr key={electorate.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatStudentId(electorate.student_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {electorate.program || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {electorate.year_level || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {electorate.phone_number || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {electorate.email || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(electorate)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(electorate.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredElectorates.length > 0 && (
          <div className="mt-4 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Showing info & Items per page */}
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{showingFrom}</span> to{" "}
                  <span className="font-semibold text-gray-900">{showingTo}</span> of{" "}
                  <span className="font-semibold text-gray-900">{totalItems}</span> voters
                </div>

                {/* Items per page selector */}
                <div className="flex items-center gap-2">
                  <label htmlFor="itemsPerPage" className="text-sm text-gray-600">
                    Show:
                  </label>
                  <select
                    id="itemsPerPage"
                    value={itemsPerPage}
                    onChange={handleItemsPerPageChange}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center gap-2">
                {/* First page */}
                <button
                  onClick={goToFirstPage}
                  disabled={currentPage === 1}
                  className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="First page"
                >
                  <ChevronsLeft className="h-4 w-4 text-gray-600" />
                </button>

                {/* Previous page */}
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Previous page"
                >
                  <ChevronLeft className="h-4 w-4 text-gray-600" />
                </button>

                {/* Page numbers */}
                <div className="hidden sm:flex items-center gap-1">
                  {getPageNumbers().map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${currentPage === pageNum
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                        }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                {/* Mobile page indicator */}
                <div className="sm:hidden px-3 py-1.5 text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </div>

                {/* Next page */}
                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Next page"
                >
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                </button>

                {/* Last page */}
                <button
                  onClick={goToLastPage}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Last page"
                >
                  <ChevronsRight className="h-4 w-4 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        )}

        {electorates.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p>No voters found. Add voters individually or upload in bulk.</p>
          </div>
        )}
      </div>
    </>
  );
};