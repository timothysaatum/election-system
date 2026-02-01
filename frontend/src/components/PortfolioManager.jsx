import { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search, Briefcase, Hash, ToggleLeft, ToggleRight } from 'lucide-react';
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
        
        .portfolio-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .portfolio-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
        }
        
        .stat-box {
          transition: all 0.2s ease;
        }
        
        .stat-box:hover {
          transform: scale(1.03);
        }
      `}</style>

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <ConfirmModal {...confirmModal} onConfirm={confirmModal.handleConfirm} onClose={confirmModal.handleClose} {...confirmModal.modalProps} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      <div className="bg-gradient-to-br from-white via-purple-50/30 to-white rounded-2xl shadow-xl p-6 border border-slate-200">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
                <Briefcase className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900">Portfolios</h2>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span className="font-semibold">{stats.total}</span>
              <span>total</span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-green-600">{stats.active}</span>
              <span>active</span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-purple-600">{stats.totalSlots}</span>
              <span>slots</span>
            </div>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-5 py-2 rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all font-semibold shadow-lg hover:shadow-xl"
          >
            <Plus className="h-5 w-5" />
            Add Portfolio
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="stat-box p-4 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl border-2 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase mb-1">Active</p>
                <p className="text-3xl font-bold text-green-900">{stats.active}</p>
              </div>
              <ToggleRight className="h-10 w-10 text-green-600" />
            </div>
          </div>
          <div className="stat-box p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-xl border-2 border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700 uppercase mb-1">Inactive</p>
                <p className="text-3xl font-bold text-slate-900">{stats.inactive}</p>
              </div>
              <ToggleLeft className="h-10 w-10 text-slate-600" />
            </div>
          </div>
          <div className="stat-box p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl border-2 border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-purple-700 uppercase mb-1">Total Slots</p>
                <p className="text-3xl font-bold text-purple-900">{stats.totalSlots}</p>
              </div>
              <Hash className="h-10 w-10 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 relative">
          <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search portfolios by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
          />
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="form-container mb-6 p-6 bg-gradient-to-br from-slate-50 to-purple-50/30 rounded-xl border-2 border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              {editingId ? 'Edit Portfolio' : 'Add New Portfolio'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  required
                  placeholder="e.g., President, Vice President"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Voting Order</label>
                <input
                  type="number"
                  value={formData.voting_order}
                  onChange={(e) => setFormData({ ...formData, voting_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Max Candidates</label>
                <input
                  type="number"
                  value={formData.max_candidates}
                  onChange={(e) => setFormData({ ...formData, max_candidates: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                  min="1"
                  placeholder="1"
                />
              </div>
              <div className="flex items-center p-4 bg-white rounded-xl border-2 border-slate-200">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-5 w-5 text-purple-600 rounded border-slate-300 focus:ring-2 focus:ring-purple-500"
                  id="portfolio-is-active"
                />
                <label htmlFor="portfolio-is-active" className="ml-3 text-sm font-semibold text-slate-700">
                  Active (visible to voters)
                </label>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none"
                rows="3"
                placeholder="Brief description of this portfolio position..."
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="submit"
                className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-3 rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all font-semibold shadow-lg hover:shadow-xl"
              >
                {editingId ? 'Update Portfolio' : 'Create Portfolio'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setFormData({ name: '', description: '', is_active: true, max_candidates: 1, voting_order: 0 });
                }}
                className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-all font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Portfolios List */}
        {filteredPortfolios.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Briefcase className="h-16 w-16 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">{searchTerm ? 'No portfolios match your search' : 'No portfolios yet'}</p>
            <p className="text-sm mt-1">Create your first portfolio to get started</p>
          </div>
        )}

        <div className="space-y-4">
          {filteredPortfolios.map((portfolio) => (
            <div key={portfolio.id} className="portfolio-card border-2 border-slate-200 rounded-2xl p-5 bg-white shadow-sm">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="p-2 bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg mt-0.5">
                      <Briefcase className="h-5 w-5 text-purple-700" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-slate-900 mb-1">{portfolio.name}</h3>
                      {portfolio.description && (
                        <p className="text-sm text-slate-600 mb-3">{portfolio.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 text-sm">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-semibold">
                          Order: {portfolio.voting_order}
                        </span>
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full font-semibold">
                          Max: {portfolio.max_candidates}
                        </span>
                        <span className={`px-3 py-1 rounded-full font-semibold ${portfolio.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {portfolio.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(portfolio)}
                    className="p-3 text-purple-600 hover:bg-purple-50 rounded-xl transition-all border-2 border-transparent hover:border-purple-200"
                    aria-label="Edit portfolio"
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(portfolio.id)}
                    className="p-3 text-red-600 hover:bg-red-50 rounded-xl transition-all border-2 border-transparent hover:border-red-200"
                    aria-label="Delete portfolio"
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