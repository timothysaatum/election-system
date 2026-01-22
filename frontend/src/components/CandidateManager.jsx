import { useState, useMemo, useRef } from 'react';
import { Plus, Edit2, Trash2, Upload, X, Search, Printer } from 'lucide-react';
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
                <th>Party</th>
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
                  <td>${c.party || '-'}</td>
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
      printWindow.document.innerHTML = htmlContent;
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

  // Helper function to get full image URL
  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    // Ensure URL starts with /
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `http://localhost:8000${cleanUrl}`;
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
    setFormData({ name: '', portfolio_id: '', picture_url: '', manifesto: '', bio: '', is_active: true, display_order: 0 });
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
    // Set preview with full URL
    if (candidate.picture_url) {
      setImagePreview(getImageUrl(candidate.picture_url));
    }
    setEditingId(candidate.id);
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
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <ConfirmModal {...confirmModal} onConfirm={confirmModal.handleConfirm} onClose={confirmModal.handleClose} {...confirmModal.modalProps} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Candidates</h2>
            <p className="text-sm text-gray-600 mt-1">{stats.total} total • {stats.active} active</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              title="Print Candidates List"
            >
              <Printer className="h-5 w-5" />
              Print
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Add Candidate
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search candidates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterPortfolio}
            onChange={(e) => setFilterPortfolio(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Portfolios</option>
            {portfolios.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {stats.byPortfolio.map(pf => pf.count > 0 && (
              <div key={pf.name} className="px-3 py-2 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">
                {pf.name}: {pf.count}
              </div>
            ))}
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Portfolio *</label>
                <select
                  value={formData.portfolio_id}
                  onChange={(e) => setFormData({ ...formData, portfolio_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Select Portfolio</option>
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Candidate Photo</label>
              <div className="flex items-center gap-4">
                {imagePreview && (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-24 w-24 rounded-full object-cover border-2 border-gray-300"
                      onError={(e) => {
                        console.error('Image failed to load:', imagePreview);
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Crect width="96" height="96" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview(null);
                        setFormData({ ...formData, picture_url: '' });
                      }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <label className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <Upload className="h-5 w-5" />
                  {uploading ? 'Uploading...' : 'Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">Maximum file size: 5MB</p>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Display Order</label>
              <input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows="2"
              />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Manifesto</label>
              <textarea
                value={formData.manifesto}
                onChange={(e) => setFormData({ ...formData, manifesto: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows="3"
              />
            </div>

            <div className="flex items-center mt-4">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label className="ml-2 text-sm text-gray-700">Active</label>
            </div>

            <div className="flex gap-2 mt-4">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700" disabled={uploading}>
                {editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={resetForm} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="space-y-4">
          {filteredCandidates.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>{searchTerm || filterPortfolio ? 'No candidates match your filters' : 'No candidates yet'}</p>
            </div>
          )}
          {filteredCandidates.map((candidate) => {
            const imageUrl = getImageUrl(candidate.picture_url);
            return (
              <div key={candidate.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div className="flex gap-4 flex-1">
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt={candidate.name}
                        className="h-16 w-16 rounded-full object-cover border-2 border-gray-200"
                        onError={(e) => {
                          console.error('Failed to load image for candidate:', candidate.name, imageUrl);
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                    {!imageUrl && (
                      <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                        No Photo
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{candidate.name}</h3>
                      <p className="text-sm text-blue-600">{candidate.portfolio?.name}</p>
                      {candidate.bio && <p className="text-sm text-gray-600 mt-1">{candidate.bio}</p>}
                      <div className="flex gap-4 mt-2 text-sm text-gray-500">
                        <span>Order: {candidate.display_order}</span>
                        <span className={candidate.is_active ? 'text-green-600' : 'text-red-600'}>
                          {candidate.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(candidate)} className="p-2 text-blue-600 hover:bg-blue-50 rounded">
                      <Edit2 className="h-5 w-5" />
                    </button>
                    <button onClick={() => handleDelete(candidate.id)} className="p-2 text-red-600 hover:bg-red-50 rounded">
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