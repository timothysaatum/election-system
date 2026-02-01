import { useState, useMemo, useRef } from 'react';
import { Plus, Edit2, Trash2, Upload, X, Search, Printer, Filter, User, Award } from 'lucide-react';
import { api } from '../services/api';
import { ConfirmModal, AlertModal } from './Modal';
import { ToastContainer } from './Toast';
import { useModal } from '../hooks/useModal';
import { useToast } from '../hooks/useToast';

export const CandidateManager = ({ candidates, portfolios, onUpdate }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPortfolio, setFilterPortfolio] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    portfolio_id: '',
    picture_url: '',
    manifesto: '',
    bio: '',
    is_active: true,
    display_order: 0,
  });

  const confirmModal = useModal();
  const alertModal = useModal();
  const toast = useToast();
  const printRef = useRef();

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    const filteredData = candidates.filter(c =>
      (c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.bio && c.bio.toLowerCase().includes(searchTerm.toLowerCase()))) &&
      (!filterPortfolio || c.portfolio_id === parseInt(filterPortfolio))
    );

    const htmlContent = `
      <html>
        <head>
          <title>Candidates List - Print</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; color: #333; margin-bottom: 20px; }
            .summary { margin-bottom: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #0066cc; color: white; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            tr:hover { background-color: #f0f0f0; }
            .active-badge { background-color: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            .inactive-badge { background-color: #ffebee; color: #c62828; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            @media print {
              body { margin: 10px; }
            }
          </style>
        </head>
        <body>
          <h1>Candidates List Report</h1>
          <div class="summary">
            <p><strong>Total Candidates:</strong> ${stats.total}</p>
            <p><strong>Active:</strong> ${stats.active}</p>
            ${stats.byPortfolio.map(pf => `<p><strong>${pf.name}:</strong> ${pf.count}</p>`).join('')}
            <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Portfolio</th>
                <th>Bio</th>
                <th>Manifesto</th>
                <th>Display Order</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.map(c => `
                <tr>
                  <td>${c.name || '-'}</td>
                  <td>${portfolios.find(p => p.id === c.portfolio_id)?.name || '-'}</td>
                  <td>${c.bio || '-'}</td>
                  <td>${c.manifesto || '-'}</td>
                  <td>${c.display_order || 0}</td>
                  <td><span class="${c.is_active ? 'active-badge' : 'inactive-badge'}">${c.is_active ? 'Active' : 'Inactive'}</span></td>
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

  const stats = useMemo(() => ({
    total: candidates.length,
    active: candidates.filter(c => c.is_active).length,
    byPortfolio: portfolios.map(p => ({
      name: p.name,
      count: candidates.filter(c => c.portfolio_id === p.id).length
    })),
  }), [candidates, portfolios]);

  const filteredCandidates = useMemo(() =>
    candidates.filter(c =>
      (c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.bio && c.bio.toLowerCase().includes(searchTerm.toLowerCase()))) &&
      (!filterPortfolio || c.portfolio_id === parseInt(filterPortfolio))
    ), [candidates, searchTerm, filterPortfolio]);

  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return cleanUrl;
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      await alertModal.showAlert({
        title: 'Invalid File Type',
        message: 'Please select an image file',
        type: 'error'
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      await alertModal.showAlert({
        title: 'File Too Large',
        message: 'Image size must be less than 5MB',
        type: 'error'
      });
      return;
    }

    try {
      setUploading(true);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);

      const result = await api.uploadCandidateImage(file);
      setFormData({ ...formData, picture_url: result.file_url });
    } catch (err) {
      await alertModal.showAlert({
        title: 'Upload Failed',
        message: err.message,
        type: 'error'
      });
      setImagePreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.updateCandidate(editingId, formData);
      } else {
        await api.createCandidate(formData);
      }
      resetForm();
      onUpdate();

      toast.showSuccess(`Candidate ${editingId ? 'updated' : 'created'} successfully`);
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
    setImagePreview(null);
    setFormData({
      name: '',
      portfolio_id: '',
      picture_url: '',
      manifesto: '',
      bio: '',
      is_active: true,
      display_order: 0,
    });
  };

  const handleEdit = (candidate) => {
    setFormData({
      name: candidate.name,
      portfolio_id: candidate.portfolio_id,
      picture_url: candidate.picture_url || '',
      manifesto: candidate.manifesto || '',
      bio: candidate.bio || '',
      is_active: candidate.is_active,
      display_order: candidate.display_order,
    });
    setEditingId(candidate.id);
    if (candidate.picture_url) {
      setImagePreview(getImageUrl(candidate.picture_url));
    }
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const confirmed = await confirmModal.showConfirm({
      title: 'Delete Candidate',
      message: 'Are you sure you want to delete this candidate? This action cannot be undone.',
      type: 'danger'
    });

    if (!confirmed) return;

    try {
      await api.deleteCandidate(id);
      onUpdate();
      toast.showSuccess('Candidate deleted successfully');
    } catch (err) {
      await alertModal.showAlert({
        title: 'Delete Failed',
        message: err.message,
        type: 'error'
      });
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        
        * {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .form-container {
          animation: slideDown 0.3s ease-out;
        }
        
        .candidate-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .candidate-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
        }
        
        .stat-badge {
          transition: all 0.2s ease;
        }
        
        .stat-badge:hover {
          transform: scale(1.05);
        }
        
        .image-upload-area {
          transition: all 0.3s ease;
        }
        
        .image-upload-area:hover {
          border-color: #3b82f6;
          background-color: #eff6ff;
        }
      `}</style>

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <ConfirmModal {...confirmModal} onConfirm={confirmModal.handleConfirm} onClose={confirmModal.handleClose} {...confirmModal.modalProps} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      <div className="bg-gradient-to-br from-white via-blue-50/30 to-white rounded-2xl shadow-xl p-6 border border-slate-200">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                <User className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900">Candidates</h2>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="font-semibold">{stats.total}</span>
              <span>total</span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-green-600">{stats.active}</span>
              <span>active</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-all font-medium shadow-sm"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-2 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg hover:shadow-xl"
            >
              <Plus className="h-5 w-5" />
              Add Candidate
            </button>
          </div>
        </div>

        {/* Stats Badges */}
        {stats.byPortfolio.some(pf => pf.count > 0) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {stats.byPortfolio.map(pf => pf.count > 0 && (
              <div key={pf.name} className="stat-badge px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-700 text-sm rounded-full font-semibold shadow-sm">
                <Award className="inline h-4 w-4 mr-1" />
                {pf.name}: {pf.count}
              </div>
            ))}
          </div>
        )}

        {/* Search and Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidates by name or bio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
            <select
              value={filterPortfolio}
              onChange={(e) => setFilterPortfolio(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none bg-white"
            >
              <option value="">All Portfolios</option>
              {portfolios.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="form-container mb-6 p-6 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border-2 border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              {editingId ? 'Edit Candidate' : 'Add New Candidate'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  required
                  placeholder="Enter candidate name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Portfolio *</label>
                <select
                  value={formData.portfolio_id}
                  onChange={(e) => setFormData({ ...formData, portfolio_id: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none bg-white"
                  required
                >
                  <option value="">Select Portfolio</option>
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-semibold text-slate-700 mb-3">Candidate Photo</label>
              <div className="flex items-center gap-5">
                {imagePreview && (
                  <div className="relative group">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-28 w-28 rounded-2xl object-cover border-4 border-white shadow-lg"
                      onError={(e) => {
                        console.error('Image failed to load:', imagePreview);
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="112" height="112"%3E%3Crect width="112" height="112" fill="%23e2e8f0"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview(null);
                        setFormData({ ...formData, picture_url: '' });
                      }}
                      className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full p-1.5 shadow-lg hover:from-red-600 hover:to-red-700 transition-all"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <label className="image-upload-area flex items-center gap-3 px-6 py-4 bg-white border-2 border-dashed border-slate-300 rounded-xl cursor-pointer">
                  <Upload className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-semibold text-slate-700">{uploading ? 'Uploading...' : 'Upload Photo'}</p>
                    <p className="text-xs text-slate-500">Max 5MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Display Order</label>
              <input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="0"
              />
            </div>

            <div className="mt-5">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Bio</label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                rows="3"
                placeholder="Brief biography of the candidate..."
              />
            </div>

            <div className="mt-5">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Manifesto</label>
              <textarea
                value={formData.manifesto}
                onChange={(e) => setFormData({ ...formData, manifesto: e.target.value })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
                rows="4"
                placeholder="Campaign manifesto and promises..."
              />
            </div>

            <div className="flex items-center mt-5 p-4 bg-white rounded-xl border-2 border-slate-200">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-5 w-5 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500"
                id="is-active"
              />
              <label htmlFor="is-active" className="ml-3 text-sm font-semibold text-slate-700">
                Active (visible to voters)
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="submit"
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg hover:shadow-xl"
                disabled={uploading}
              >
                {editingId ? 'Update Candidate' : 'Create Candidate'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Candidates List */}
        <div className="space-y-4">
          {filteredCandidates.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <User className="h-16 w-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg font-medium">{searchTerm || filterPortfolio ? 'No candidates match your filters' : 'No candidates yet'}</p>
              <p className="text-sm mt-1">Get started by adding your first candidate</p>
            </div>
          )}
          {filteredCandidates.map((candidate) => {
            const imageUrl = getImageUrl(candidate.picture_url);
            return (
              <div key={candidate.id} className="candidate-card border-2 border-slate-200 rounded-2xl p-5 bg-white shadow-sm">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex gap-5 flex-1">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={candidate.name}
                        className="h-20 w-20 rounded-2xl object-cover border-4 border-slate-100 shadow-md flex-shrink-0"
                        onError={(e) => {
                          console.error('Failed to load image for candidate:', candidate.name, imageUrl);
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-400 text-xs font-medium flex-shrink-0 shadow-md border-4 border-white">
                        <User className="h-8 w-8" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-slate-900 mb-1">{candidate.name}</h3>
                      <p className="text-sm font-semibold text-blue-600 mb-2 flex items-center gap-1">
                        <Award className="h-4 w-4" />
                        {candidate.portfolio?.name}
                      </p>
                      {candidate.bio && (
                        <p className="text-sm text-slate-600 line-clamp-2 mb-3">{candidate.bio}</p>
                      )}
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full font-medium">
                          Order: {candidate.display_order}
                        </span>
                        <span className={`px-3 py-1 rounded-full font-semibold ${candidate.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {candidate.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(candidate)}
                      className="p-3 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border-2 border-transparent hover:border-blue-200"
                      aria-label="Edit candidate"
                    >
                      <Edit2 className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(candidate.id)}
                      className="p-3 text-red-600 hover:bg-red-50 rounded-xl transition-all border-2 border-transparent hover:border-red-200"
                      aria-label="Delete candidate"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};