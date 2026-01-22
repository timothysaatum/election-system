import { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { api } from '../services/api';
import { ConfirmModal, AlertModal } from './Modal';
import { ToastContainer } from './Toast';
import { useModal } from '../hooks/useModal';
import { useToast } from '../hooks/useToast';

export const PortfolioManager = ({ portfolios, onUpdate }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
    max_candidates: 1,
    voting_order: 0,
  });

  const confirmModal = useModal();
  const alertModal = useModal();
  const toast = useToast();

  const stats = useMemo(() => ({
    total: portfolios.length,
    active: portfolios.filter(p => p.is_active).length,
    inactive: portfolios.filter(p => !p.is_active).length,
    totalSlots: portfolios.reduce((sum, p) => sum + p.max_candidates, 0),
  }), [portfolios]);

  const filteredPortfolios = useMemo(() =>
    portfolios.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ), [portfolios, searchTerm]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.updatePortfolio(editingId, formData);
      } else {
        await api.createPortfolio(formData);
      }
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', description: '', is_active: true, max_candidates: 1, voting_order: 0 });
      onUpdate();

      toast.showSuccess(`Portfolio ${editingId ? 'updated' : 'created'} successfully`);
    } catch (err) {
      await alertModal.showAlert({
        title: 'Operation Failed',
        message: err.message,
        type: 'error'
      });
    }
  };

  const handleEdit = (portfolio) => {
    setFormData({
      name: portfolio.name,
      description: portfolio.description || '',
      is_active: portfolio.is_active,
      max_candidates: portfolio.max_candidates,
      voting_order: portfolio.voting_order,
    });
    setEditingId(portfolio.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    const confirmed = await confirmModal.showConfirm({
      title: 'Delete Portfolio',
      message: 'Are you sure you want to delete this portfolio? This action cannot be undone.',
      type: 'danger'
    });

    if (!confirmed) return;

    try {
      await api.deletePortfolio(id);
      onUpdate();
      toast.showSuccess('Portfolio deleted successfully');
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
            <h2 className="text-2xl font-bold text-gray-900">Portfolios</h2>
            <p className="text-sm text-gray-600 mt-1">{stats.total} total • {stats.active} active • {stats.totalSlots} candidate slots</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add Portfolio
          </button>
        </div>

        <div className="mb-6 relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search portfolios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Voting Order</label>
                <input
                  type="number"
                  value={formData.voting_order}
                  onChange={(e) => setFormData({ ...formData, voting_order: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Candidates</label>
                <input
                  type="number"
                  value={formData.max_candidates}
                  onChange={(e) => setFormData({ ...formData, max_candidates: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  min="1"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <label className="ml-2 text-sm text-gray-700">Active</label>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows="3"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                {editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setFormData({ name: '', description: '', is_active: true, max_candidates: 1, voting_order: 0 });
                }}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {filteredPortfolios.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>{searchTerm ? 'No portfolios match your search' : 'No portfolios yet'}</p>
          </div>
        )}

        <div className="space-y-4">
          {filteredPortfolios.map((portfolio) => (
            <div key={portfolio.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{portfolio.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{portfolio.description}</p>
                  <div className="flex gap-4 mt-2 text-sm text-gray-500">
                    <span>Order: {portfolio.voting_order}</span>
                    <span>Max: {portfolio.max_candidates}</span>
                    <span className={portfolio.is_active ? 'text-green-600' : 'text-red-600'}>
                      {portfolio.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(portfolio)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(portfolio.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};