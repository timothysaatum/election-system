import { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Upload, X, Zap, Globe, Image } from 'lucide-react';
import { api } from '../services/api';
import { ConfirmModal, AlertModal } from './Modal';
import { ToastContainer } from './Toast';
import { useModal } from '../hooks/useModal';
import { useToast } from '../hooks/useToast';

export const ElectionManager = ({ elections, onUpdate }) => {
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [logoPreview, setLogoPreview] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        logo_url: '',
        logo_filename: '',
    });

    const confirmModal = useModal();
    const alertModal = useModal();
    const toast = useToast();

    const stats = useMemo(() => ({
        total: elections.length,
        active: elections.filter(e => e.is_active).length,
    }), [elections]);

    const activeElection = useMemo(() => elections.find(e => e.is_active), [elections]);

    const getLogoUrl = (url) => {
        if (!url) return null;
        if (url.startsWith('http')) return url;
        return url.startsWith('/') ? url : `/${url}`;
    };

    const handleLogoChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            await alertModal.showAlert({ title: 'Invalid File Type', message: 'Please select an image file', type: 'error' });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            await alertModal.showAlert({ title: 'File Too Large', message: 'Image size must be less than 5MB', type: 'error' });
            return;
        }

        try {
            setUploading(true);
            const reader = new FileReader();
            reader.onloadend = () => setLogoPreview(reader.result);
            reader.readAsDataURL(file);

            const result = await api.uploadElectionLogo(file);
            setFormData(prev => ({ ...prev, logo_url: result.logo_url, logo_filename: result.filename }));
            toast.showSuccess('Logo uploaded successfully');
        } catch (err) {
            await alertModal.showAlert({ title: 'Upload Failed', message: err.message, type: 'error' });
            setLogoPreview(null);
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.updateElection(editingId, formData);
            } else {
                await api.createElection(formData);
            }
            resetForm();
            onUpdate();
            toast.showSuccess(`Election ${editingId ? 'updated' : 'created'} successfully`);
        } catch (err) {
            await alertModal.showAlert({ title: 'Operation Failed', message: err.message, type: 'error' });
        }
    };

    const resetForm = () => {
        setShowForm(false);
        setEditingId(null);
        setLogoPreview(null);
        setFormData({ name: '', logo_url: '', logo_filename: '' });
    };

    const handleEdit = (election) => {
        setFormData({
            name: election.name,
            logo_url: election.logo_url || '',
            logo_filename: election.logo_filename || '',
        });
        setEditingId(election.id);
        if (election.logo_url) setLogoPreview(getLogoUrl(election.logo_url));
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        const confirmed = await confirmModal.showConfirm({
            title: 'Delete Election',
            message: 'Are you sure you want to delete this election? This action cannot be undone.',
            type: 'danger',
        });
        if (!confirmed) return;
        try {
            await api.deleteElection(id);
            onUpdate();
            toast.showSuccess('Election deleted successfully');
        } catch (err) {
            await alertModal.showAlert({ title: 'Delete Failed', message: err.message, type: 'error' });
        }
    };

    const handleSetActive = async (election) => {
        if (election.is_active) return;
        const confirmed = await confirmModal.showConfirm({
            title: 'Set Active Election',
            message: `Set "${election.name}" as the active election? This will deactivate any currently active election.`,
            type: 'warning',
        });
        if (!confirmed) return;
        try {
            await api.updateElection(election.id, { is_active: true });
            onUpdate();
            toast.showSuccess(`"${election.name}" is now the active election`);
        } catch (err) {
            await alertModal.showAlert({ title: 'Update Failed', message: err.message, type: 'error' });
        }
    };

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .form-container { animation: slideDown 0.3s ease-out; }
        .election-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          animation: fadeIn 0.4s ease-out forwards;
        }
        .election-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px -6px rgba(0,0,0,0.12);
        }
        .active-glow {
          box-shadow: 0 0 0 2px #16a34a, 0 8px 24px -4px rgba(22,163,74,0.2);
        }
        .logo-upload-area { transition: all 0.3s ease; }
        .logo-upload-area:hover { border-color: #3b82f6; background-color: #eff6ff; }
      `}</style>

            <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
            <ConfirmModal {...confirmModal} onConfirm={confirmModal.handleConfirm} onClose={confirmModal.handleClose} {...confirmModal.modalProps} />
            <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

            <div className="bg-gradient-to-br from-white via-blue-50/30 to-white rounded-2xl shadow-xl p-6 border border-slate-200">

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg">
                                <Globe className="h-6 w-6 text-white" />
                            </div>
                            <h2 className="text-3xl font-bold text-slate-900">Elections</h2>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-600">
                            <span className="font-semibold">{stats.total}</span><span>total</span>
                            <span className="text-slate-300">•</span>
                            <span className="font-semibold text-emerald-600">{stats.active}</span>
                            <span>active</span>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-5 py-2 rounded-xl hover:from-emerald-700 hover:to-teal-800 transition-all font-semibold shadow-lg hover:shadow-xl"
                    >
                        <Plus className="h-5 w-5" /> New Election
                    </button>
                </div>

                {/* Active Election Banner */}
                {activeElection && (
                    <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl flex items-center gap-4">
                        {activeElection.logo_url ? (
                            <img
                                src={getLogoUrl(activeElection.logo_url)}
                                alt={activeElection.name}
                                className="h-12 w-12 rounded-xl object-contain border-2 border-white shadow-md bg-white"
                            />
                        ) : (
                            <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center border-2 border-white shadow-md">
                                <Zap className="h-6 w-6 text-emerald-600" />
                            </div>
                        )}
                        <div className="flex-1">
                            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Currently Active</p>
                            <p className="text-lg font-bold text-emerald-900">{activeElection.name}</p>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 rounded-full">
                            <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-xs font-semibold text-emerald-700">LIVE</span>
                        </div>
                    </div>
                )}

                {/* Form — name + logo only */}
                {showForm && (
                    <form onSubmit={handleSubmit} className="form-container mb-6 p-6 bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-xl border-2 border-slate-200">
                        <h3 className="text-xl font-bold text-slate-900 mb-5">
                            {editingId ? 'Edit Election' : 'Create New Election'}
                        </h3>

                        {/* Name */}
                        <div className="mb-5">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Election Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                                required
                                placeholder="e.g. SRC Elections 2026"
                            />
                        </div>

                        {/* Logo */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-3">Election Logo</label>
                            <div className="flex items-center gap-5">
                                {logoPreview ? (
                                    <div className="relative">
                                        <img
                                            src={logoPreview}
                                            alt="Logo preview"
                                            className="h-24 w-24 rounded-2xl object-contain border-4 border-white shadow-lg bg-slate-50"
                                            onError={(e) => { e.target.src = ''; setLogoPreview(null); }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setLogoPreview(null); setFormData({ ...formData, logo_url: '', logo_filename: '' }); }}
                                            className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full p-1.5 shadow-lg hover:from-red-600 hover:to-red-700 transition-all"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="h-24 w-24 rounded-2xl bg-slate-100 border-4 border-white shadow-lg flex items-center justify-center">
                                        <Image className="h-8 w-8 text-slate-400" />
                                    </div>
                                )}
                                <label className="logo-upload-area flex items-center gap-3 px-6 py-4 bg-white border-2 border-dashed border-slate-300 rounded-xl cursor-pointer">
                                    <Upload className="h-5 w-5 text-emerald-600" />
                                    <div>
                                        <p className="font-semibold text-slate-700">{uploading ? 'Uploading...' : 'Upload Logo'}</p>
                                        <p className="text-xs text-slate-500">PNG, SVG, JPG · Max 5MB</p>
                                    </div>
                                    <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" disabled={uploading} />
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                type="submit"
                                disabled={uploading}
                                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-3 rounded-xl hover:from-emerald-700 hover:to-teal-800 transition-all font-semibold shadow-lg hover:shadow-xl disabled:opacity-50"
                            >
                                {editingId ? 'Update Election' : 'Create Election'}
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

                {/* Elections List */}
                <div className="space-y-4">
                    {elections.length === 0 && (
                        <div className="text-center py-16 text-slate-500">
                            <Globe className="h-16 w-16 mx-auto mb-4 text-slate-300" />
                            <p className="text-lg font-medium">No elections yet</p>
                            <p className="text-sm mt-1">Create your first election to get started</p>
                        </div>
                    )}

                    {elections.map((election) => {
                        const logoUrl = getLogoUrl(election.logo_url);
                        return (
                            <div
                                key={election.id}
                                className={`election-card border-2 rounded-2xl p-5 bg-white ${election.is_active ? 'border-emerald-300 active-glow' : 'border-slate-200'}`}
                            >
                                <div className="flex justify-between items-center gap-4">
                                    <div className="flex gap-4 flex-1 items-center min-w-0">
                                        {logoUrl ? (
                                            <img
                                                src={logoUrl}
                                                alt={election.name}
                                                className="h-14 w-14 rounded-2xl object-contain border-4 border-slate-100 shadow-md flex-shrink-0 bg-white"
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        ) : (
                                            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md border-4 border-white ${election.is_active ? 'bg-gradient-to-br from-emerald-100 to-teal-100' : 'bg-gradient-to-br from-slate-100 to-slate-200'}`}>
                                                <Globe className={`h-6 w-6 ${election.is_active ? 'text-emerald-600' : 'text-slate-400'}`} />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-lg font-bold text-slate-900 truncate">{election.name}</h3>
                                                {election.is_active && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full flex-shrink-0">
                                                        <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                                        ACTIVE
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                Created {new Date(election.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {!election.is_active && (
                                            <button
                                                onClick={() => handleSetActive(election)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all"
                                            >
                                                <Zap className="h-3.5 w-3.5" /> Set Active
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleEdit(election)}
                                            className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all border-2 border-transparent hover:border-blue-200"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(election.id)}
                                            className="p-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-all border-2 border-transparent hover:border-red-200"
                                        >
                                            <Trash2 className="h-4 w-4" />
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