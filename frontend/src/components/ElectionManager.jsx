import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Plus, Lock, Unlock, ChevronRight, Calendar, RefreshCw,
    CheckCircle2, Clock, Archive, Eye, Zap, Edit3, X, AlertTriangle,
    Users, UserPlus, UserMinus, Upload, Search, ChevronDown, ChevronUp,
    CheckCircle, AlertCircle, Save,
} from 'lucide-react';
import { api } from '../services/api';
import { ConfirmModal, AlertModal } from './Modal';
import { ToastContainer } from './Toast';
import { useModal } from '../hooks/useModal';
import { useToast } from '../hooks/useToast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_ORDER = ['DRAFT', 'READY', 'OPEN', 'CLOSED', 'PUBLISHED'];

const STATUS_META = {
    DRAFT: { label: 'Draft', color: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', icon: Edit3 },
    READY: { label: 'Ready', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500', icon: CheckCircle2 },
    OPEN: { label: 'Open', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500', icon: Zap },
    CLOSED: { label: 'Closed', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', icon: X },
    PUBLISHED: { label: 'Published', color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500', icon: Eye },
};

const NEXT_STATUS = {
    DRAFT: 'READY', READY: 'OPEN', OPEN: 'CLOSED', CLOSED: 'PUBLISHED', PUBLISHED: null,
};

const TRANSITION_LABELS = {
    READY: 'Mark Ready', OPEN: 'Open Election', CLOSED: 'Close Election', PUBLISHED: 'Publish Results',
};

const TRANSITION_COLORS = {
    READY: 'bg-blue-600 hover:bg-blue-700 text-white',
    OPEN: 'bg-green-600 hover:bg-green-700 text-white',
    CLOSED: 'bg-red-600 hover:bg-red-700 text-white',
    PUBLISHED: 'bg-purple-600 hover:bg-purple-700 text-white',
};

const TRANSITION_WARNINGS = {
    OPEN: 'Opening the election allows voters to begin casting votes. Ensure all candidates and tokens are set up first.',
    CLOSED: 'Closing the election will prevent any further voting. This cannot be undone.',
    PUBLISHED: 'Publishing will make the final results publicly visible.',
};

const norm = (s) => (s || '').toUpperCase();

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

const StatusBadge = ({ status }) => {
    const meta = STATUS_META[norm(status)] || STATUS_META.DRAFT;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
        </span>
    );
};

// ---------------------------------------------------------------------------
// Status timeline
// ---------------------------------------------------------------------------

const StatusTimeline = ({ status }) => {
    const currentIdx = STATUS_ORDER.indexOf(norm(status));
    return (
        <div className="flex items-center gap-1">
            {STATUS_ORDER.map((s, i) => {
                const done = i <= currentIdx;
                const meta = STATUS_META[s];
                return (
                    <div key={s} className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full transition-all ${done ? meta.dot : 'bg-slate-200'}`} />
                        {i < STATUS_ORDER.length - 1 && (
                            <div className={`w-5 h-0.5 ${i < currentIdx ? 'bg-slate-400' : 'bg-slate-200'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ---------------------------------------------------------------------------
// VoterRollPanel helpers
// ---------------------------------------------------------------------------

const normaliseRollEntry = (entry) => {
    const e = entry?.electorate || {};
    return {
        rollId: entry.id,
        electorate_id: entry.electorate_id || e.id || entry.id,
        has_voted: entry.has_voted ?? false,
        voted_at: entry.voted_at,
        student_id: e.student_id || entry.student_id || '',
        name: e.name || entry.name || '',
        program: e.program || entry.program || '',
        year_level: e.year_level || entry.year_level,
        email: e.email || entry.email || '',
        phone_number: e.phone_number || entry.phone_number || '',
    };
};

// ---------------------------------------------------------------------------
// VoterRollPanel
// ---------------------------------------------------------------------------

const VoterRollPanel = ({ election, allElectorates = [] }) => {
    const [roll, setRoll] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addSearch, setAddSearch] = useState('');
    const [rollSearch, setRollSearch] = useState('');
    const [showAddDropdown, setShowAddDropdown] = useState(false);
    const [adding, setAdding] = useState(null);
    const [removing, setRemoving] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 200;

    const confirmModal = useModal();
    const toast = useToast();

    const fetchRoll = useCallback(async (pageNum = 0) => {
        setLoading(true);
        try {
            const skip = pageNum * PAGE_SIZE;
            const data = await api.getVoterRoll(election.id, skip, PAGE_SIZE);
            const rows = Array.isArray(data) ? data : [];
            const normalised = rows.map(normaliseRollEntry);
            if (pageNum === 0) {
                setRoll(normalised);
            } else {
                setRoll(prev => [...prev, ...normalised]);
            }
            setPage(pageNum);
        } catch (err) {
            toast.showError('Failed to load voter roll: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [election.id]);

    const loadMore = useCallback(() => fetchRoll(page + 1), [fetchRoll, page]);
    useEffect(() => { fetchRoll(0); }, [fetchRoll]);

    const enrolledIds = useMemo(() => new Set(roll.map(r => r.electorate_id)), [roll]);
    const hasMore = roll.length > 0 && roll.length % PAGE_SIZE === 0;
    const isEditable = !['CLOSED', 'PUBLISHED'].includes(norm(election.status));

    const addCandidates = useMemo(() => {
        const q = addSearch.toLowerCase();
        return allElectorates.filter(e => {
            if (enrolledIds.has(e.id)) return false;
            if (!q) return true;
            return (
                e.student_id?.toLowerCase().includes(q) ||
                e.name?.toLowerCase().includes(q) ||
                e.program?.toLowerCase().includes(q)
            );
        }).slice(0, 20);
    }, [allElectorates, enrolledIds, addSearch]);

    const filteredRoll = useMemo(() => {
        const q = rollSearch.toLowerCase();
        if (!q) return roll;
        return roll.filter(r =>
            r.student_id?.toLowerCase().includes(q) ||
            r.name?.toLowerCase().includes(q) ||
            r.program?.toLowerCase().includes(q)
        );
    }, [roll, rollSearch]);

    const stats = useMemo(() => ({
        total: roll.length,
        voted: roll.filter(r => r.has_voted).length,
    }), [roll]);

    const fmtId = (id) => id ? id.replace(/-/g, '/') : '';

    const handleAdd = async (electorate) => {
        setAdding(electorate.id);
        setShowAddDropdown(false);
        setAddSearch('');
        try {
            await api.addVoterToRoll(election.id, electorate.id);
            toast.showSuccess(`${electorate.name || electorate.student_id} added to roll`);
            await fetchRoll(0);
        } catch (err) {
            toast.showError(err.message || 'Failed to add voter');
        } finally {
            setAdding(null);
        }
    };

    const handleRemove = async (rollEntry) => {
        const name = rollEntry.name || rollEntry.student_id || 'voter';
        const confirmed = await confirmModal.showConfirm({
            title: 'Remove from Voter Roll',
            message: `Remove ${name} from this election's voter roll? They will no longer be eligible to vote.`,
            type: 'danger',
        });
        if (!confirmed) return;
        setRemoving(rollEntry.electorate_id);
        try {
            await api.removeVoterFromRoll(election.id, rollEntry.electorate_id);
            toast.showSuccess(`${name} removed from roll`);
            await fetchRoll(0);
        } catch (err) {
            toast.showError(err.message || 'Failed to remove voter');
        } finally {
            setRemoving(null);
        }
    };

    const handleBulkUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls', 'csv'].includes(ext)) {
            toast.showError('Please upload a CSV or Excel file (.xlsx, .xls, .csv)');
            return;
        }
        setUploading(true);
        setUploadResult(null);
        try {
            const result = await api.bulkUploadVoterRoll(election.id, file);
            setUploadResult(result);
            toast.showSuccess(`Import complete — ${result.added} added, ${result.skipped} already enrolled`);
            await fetchRoll(0);
        } catch (err) {
            toast.showError(err.message || 'Bulk upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <ConfirmModal {...confirmModal} onConfirm={confirmModal.handleConfirm} onClose={confirmModal.handleClose} {...confirmModal.modalProps} />

            <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-indigo-100 rounded-lg">
                            <Users className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-800">Voter Roll</h4>
                            <p className="text-xs text-slate-500">
                                {loading ? '…' : `${stats.total} enrolled • ${stats.voted} voted`}
                            </p>
                        </div>
                    </div>

                    {isEditable && (
                        <div className="flex items-center gap-2">
                            <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border-2 cursor-pointer transition-all ${uploading
                                ? 'border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed'
                                : 'border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100'}`}>
                                {uploading
                                    ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                                    : <><Upload className="h-3.5 w-3.5" /> Bulk Upload</>
                                }
                                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBulkUpload} disabled={uploading} />
                            </label>

                            <div className="relative">
                                <button
                                    onClick={() => setShowAddDropdown(v => !v)}
                                    disabled={!!adding}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all"
                                >
                                    {adding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                                    Add Voter
                                </button>

                                {showAddDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => { setShowAddDropdown(false); setAddSearch(''); }} />
                                        <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-30 overflow-hidden">
                                            <div className="p-3 border-b border-slate-100">
                                                <div className="relative">
                                                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                                                    <input autoFocus type="text" placeholder="Search by ID, name, program…"
                                                        value={addSearch} onChange={e => setAddSearch(e.target.value)}
                                                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                                                    />
                                                </div>
                                            </div>
                                            <div className="max-h-56 overflow-y-auto">
                                                {addCandidates.length === 0 ? (
                                                    <p className="text-sm text-slate-400 text-center py-6">
                                                        {addSearch ? 'No matching voters found' : 'All voters already enrolled'}
                                                    </p>
                                                ) : (
                                                    addCandidates.map(e => (
                                                        <button key={e.id} onClick={() => handleAdd(e)}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="text-sm font-semibold text-slate-800">{e.name || e.student_id}</p>
                                                                <p className="text-xs text-slate-500">{e.student_id}{e.program ? ` • ${e.program}` : ''}</p>
                                                            </div>
                                                            <UserPlus className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                            {allElectorates.length === 0 && (
                                                <p className="text-xs text-amber-600 text-center py-3 border-t border-slate-100 bg-amber-50">
                                                    No voters in the global registry yet. Add them in the Voters tab first.
                                                </p>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {uploadResult && (
                    <div className={`mb-3 p-3 rounded-xl text-xs flex items-start gap-2 ${uploadResult.success
                        ? 'bg-green-50 border border-green-200 text-green-800'
                        : 'bg-red-50 border border-red-200 text-red-800'}`}>
                        {uploadResult.success
                            ? <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                            : <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                        }
                        <div className="flex-1">
                            <p className="font-semibold">{uploadResult.message || (uploadResult.success ? 'Import complete' : 'Import failed')}</p>
                            {uploadResult.success && (
                                <p className="mt-0.5 text-green-700">
                                    {uploadResult.added} added · {uploadResult.skipped} already enrolled · {uploadResult.updated} registry updated
                                    {uploadResult.errors?.length > 0 && ` · ${uploadResult.errors.length} errors`}
                                </p>
                            )}
                            {uploadResult.errors?.length > 0 && (
                                <ul className="mt-1 space-y-0.5">
                                    {uploadResult.errors.slice(0, 5).map((err, i) => (
                                        <li key={i} className="text-red-700">Row {err.row}: {err.error}</li>
                                    ))}
                                    {uploadResult.errors.length > 5 && <li className="text-red-600">…and {uploadResult.errors.length - 5} more</li>}
                                </ul>
                            )}
                        </div>
                        <button onClick={() => setUploadResult(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {roll.length > 5 && (
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-2 h-4 w-4 text-slate-400" />
                        <input type="text" placeholder="Search enrolled voters…" value={rollSearch}
                            onChange={e => setRollSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                        />
                    </div>
                )}

                {loading && roll.length === 0 ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading voter roll…</span>
                    </div>
                ) : roll.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-slate-500 mb-1">No voters enrolled</p>
                        <p className="text-xs text-slate-400">
                            {isEditable ? 'Add individual voters above or bulk-upload a CSV/Excel file.' : 'This election had no voter roll.'}
                        </p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <div className="hidden sm:grid sm:grid-cols-[1.25rem_1fr_140px_80px_2rem] gap-x-3 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            <span /><span>Voter</span><span>Program</span><span>Status</span><span />
                        </div>
                        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                            {filteredRoll.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-6">No voters match your search</p>
                            ) : (
                                filteredRoll.map((entry) => (
                                    <div key={entry.rollId || entry.electorate_id}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.has_voted ? 'bg-green-500' : 'bg-slate-300'}`}
                                            title={entry.has_voted ? 'Voted' : 'Not yet voted'} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">
                                                {entry.name || fmtId(entry.student_id) || '—'}
                                            </p>
                                            <p className="text-xs text-slate-500 font-mono truncate">{fmtId(entry.student_id)}</p>
                                        </div>
                                        <span className="hidden sm:block text-xs text-slate-500 truncate w-36 flex-shrink-0">
                                            {entry.program || '—'}
                                        </span>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${entry.has_voted
                                            ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {entry.has_voted ? '✓ Voted' : 'Pending'}
                                        </span>
                                        {isEditable && (
                                            <button onClick={() => handleRemove(entry)} disabled={removing === entry.electorate_id}
                                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40 transition-all flex-shrink-0"
                                                title="Remove from roll">
                                                {removing === entry.electorate_id
                                                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                                    : <UserMinus className="h-3.5 w-3.5" />
                                                }
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
                            <span>
                                {rollSearch ? `${filteredRoll.length} of ${roll.length} shown` : `${roll.length} enrolled`}
                            </span>
                            {hasMore && !rollSearch && (
                                <button onClick={loadMore} disabled={loading}
                                    className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold disabled:opacity-50">
                                    {loading && <RefreshCw className="h-3 w-3 animate-spin" />}
                                    Load more
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {!isEditable && (
                    <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5" />
                        Voter roll is read-only once the election is Closed or Published.
                    </p>
                )}
            </div>
        </>
    );
};

// ---------------------------------------------------------------------------
// Inline Edit Form — rendered inside ElectionCard
// ---------------------------------------------------------------------------

const toLocalDatetime = (isoString) => {
    if (!isoString) return '';
    // Slice to "YYYY-MM-DDTHH:MM" which datetime-local inputs expect
    return new Date(isoString).toISOString().slice(0, 16);
};

const ElectionEditForm = ({ election, onSaved, onCancel }) => {
    const [formData, setFormData] = useState({
        name: election.name || '',
        description: election.description || '',
        opens_at: toLocalDatetime(election.opens_at),
        closes_at: toLocalDatetime(election.closes_at),
    });
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(
        election.logo_url || null
    );
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (!allowed.includes(file.type)) {
            toast.showError('Please upload a valid image file (PNG, JPG, GIF, WebP, SVG)');
            return;
        }
        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) return;
        setSaving(true);
        try {
            const payload = {
                name: formData.name.trim(),
                description: formData.description.trim() || null,
                opens_at: formData.opens_at || null,
                closes_at: formData.closes_at || null,
            };
            let updated = await api.updateElection(election.id, payload);

            // Upload new logo if one was selected
            if (logoFile) {
                try {
                    const logoData = await api.uploadElectionLogo(election.id, logoFile);
                    updated.logo_url = logoData.logo_url;
                    updated.logo_filename = logoData.logo_filename;
                } catch (logoErr) {
                    toast.showError(`Details saved but logo upload failed: ${logoErr.message}`);
                }
            }

            toast.showSuccess(`"${updated.name}" updated successfully`);
            onSaved(updated);
        } catch (err) {
            toast.showError(err.message || 'Failed to update election');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-100 rounded-lg">
                        <Edit3 className="h-4 w-4 text-blue-600" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">Edit Election</h4>
                </div>
                <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    {/* Name */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            Election Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-3 py-2 text-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                            required
                        />
                    </div>

                    {/* Description */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-3 py-2 text-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white resize-none"
                            rows={2}
                            placeholder="Optional description…"
                        />
                    </div>

                    {/* Opens At */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            <Calendar className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                            Opens At
                        </label>
                        <input
                            type="datetime-local"
                            value={formData.opens_at}
                            onChange={(e) => setFormData({ ...formData, opens_at: e.target.value })}
                            className="w-full px-3 py-2 text-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        />
                    </div>

                    {/* Closes At */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                            <Clock className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                            Closes At
                        </label>
                        <input
                            type="datetime-local"
                            value={formData.closes_at}
                            onChange={(e) => setFormData({ ...formData, closes_at: e.target.value })}
                            className="w-full px-3 py-2 text-sm border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        />
                    </div>

                    {/* Logo */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Election Logo</label>
                        <div className="flex items-center gap-3">
                            {/* Preview */}
                            <div className={`flex-shrink-0 w-14 h-14 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all ${logoPreview ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                                {logoPreview
                                    ? <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain p-1" />
                                    : <Upload className="h-5 w-5 text-slate-300" />
                                }
                            </div>
                            <div className="flex-1">
                                <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all text-xs font-semibold ${logoFile ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}>
                                    <Upload className="h-3.5 w-3.5" />
                                    {logoFile ? 'Change Logo' : election.logo_url ? 'Replace Logo' : 'Upload Logo'}
                                    <input type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={handleLogoChange} />
                                </label>
                                <p className="mt-1 text-xs text-slate-400">
                                    {logoFile ? logoFile.name : 'PNG, JPG, GIF, WebP or SVG'}
                                </p>
                            </div>
                            {/* Remove logo preview */}
                            {logoPreview && (
                                <button type="button"
                                    onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                                    title="Remove logo">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Locked warning */}
                {election.is_locked && (
                    <div className="mb-3 flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                        <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                        This election is locked. Unlock it first if the backend rejects changes.
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        type="submit"
                        disabled={saving || !formData.name.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                    >
                        {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 border-2 border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-all"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Create Election Form
// ---------------------------------------------------------------------------

const CreateElectionForm = ({ onCreated, onCancel }) => {
    const [formData, setFormData] = useState({ name: '', description: '', opens_at: '', closes_at: '' });
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (!allowed.includes(file.type)) {
            toast.showError('Please upload a valid image file (PNG, JPG, GIF, WebP, SVG)');
            return;
        }
        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) return;
        setSaving(true);
        try {
            const payload = {
                name: formData.name.trim(),
                description: formData.description.trim() || null,
                opens_at: formData.opens_at || null,
                closes_at: formData.closes_at || null,
            };
            const created = await api.createElection(payload);

            if (logoFile) {
                try {
                    const logoData = await api.uploadElectionLogo(created.id, logoFile);
                    created.logo_url = logoData.logo_url;
                    created.logo_filename = logoData.logo_filename;
                } catch (logoErr) {
                    toast.showError(`Election created but logo upload failed: ${logoErr.message}`);
                }
            }

            toast.showSuccess(`Election "${created.name}" created successfully`);
            onCreated(created);
        } catch (err) {
            toast.showError(err.message || 'Failed to create election');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/40 rounded-2xl border-2 border-blue-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 rounded-xl"><Plus className="h-5 w-5 text-white" /></div>
                    <h3 className="text-xl font-bold text-slate-900">New Election</h3>
                </div>
                <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-all">
                    <X className="h-5 w-5" />
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Election Name <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                            placeholder="e.g. SRC General Elections 2025" required autoFocus
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                        <textarea value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white resize-none"
                            placeholder="Optional description of this election…" rows={2}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            <Calendar className="inline h-4 w-4 mr-1 text-slate-400" />
                            Opens At <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <input type="datetime-local" value={formData.opens_at}
                            onChange={(e) => setFormData({ ...formData, opens_at: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            <Clock className="inline h-4 w-4 mr-1 text-slate-400" />
                            Closes At <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <input type="datetime-local" value={formData.closes_at}
                            onChange={(e) => setFormData({ ...formData, closes_at: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Election Logo <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <div className="flex items-center gap-4">
                            <div className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all ${logoPreview ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                                {logoPreview
                                    ? <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain p-1" />
                                    : <Upload className="h-6 w-6 text-slate-300" />
                                }
                            </div>
                            <div className="flex-1">
                                <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all w-fit text-sm font-semibold ${logoFile ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`}>
                                    <Upload className="h-4 w-4" />
                                    {logoFile ? 'Change Logo' : 'Choose Image'}
                                    <input type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={handleLogoChange} />
                                </label>
                                {logoFile
                                    ? <p className="mt-1.5 text-xs text-slate-500 truncate max-w-xs">{logoFile.name}</p>
                                    : <p className="mt-1.5 text-xs text-slate-400">PNG, JPG, GIF, WebP or SVG</p>
                                }
                            </div>
                            {logoFile && (
                                <button type="button" onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all flex-shrink-0" title="Remove logo">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={saving || !formData.name.trim()}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2">
                        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {saving ? 'Creating…' : 'Create Election'}
                    </button>
                    <button type="button" onClick={onCancel}
                        className="px-6 py-3 border-2 border-slate-300 text-slate-700 rounded-xl hover:bg-white hover:border-slate-400 transition-all font-semibold">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Election Card
// ---------------------------------------------------------------------------

const ElectionCard = ({ election, isActive, onSelect, onStatusChange, onLockToggle, allElectorates }) => {
    const [transitioning, setTransitioning] = useState(false);
    const [locking, setLocking] = useState(false);
    const [showRoll, setShowRoll] = useState(false);
    const [showEdit, setShowEdit] = useState(false);

    const status = norm(election.status);
    const nextStatus = NEXT_STATUS[status];

    const confirmModal = useModal();
    const alertModal = useModal();
    const toast = useToast();

    const handleTransition = async () => {
        if (!nextStatus) return;
        const warning = TRANSITION_WARNINGS[nextStatus];
        if (warning) {
            const confirmed = await confirmModal.showConfirm({
                title: `${TRANSITION_LABELS[nextStatus]}?`,
                message: warning,
                type: nextStatus === 'CLOSED' ? 'danger' : 'warning',
            });
            if (!confirmed) return;
        }
        setTransitioning(true);
        try {
            await api.updateElectionStatus(election.id, nextStatus.toLowerCase());
            toast.showSuccess(`Election moved to ${STATUS_META[nextStatus].label}`);
            onStatusChange();
        } catch (err) {
            await alertModal.showAlert({ title: 'Transition Failed', message: err.message, type: 'error' });
        } finally {
            setTransitioning(false);
        }
    };

    const handleLockToggle = async () => {
        const isLocked = election.is_locked;
        const confirmed = await confirmModal.showConfirm({
            title: isLocked ? 'Unlock Election?' : 'Lock Election?',
            message: isLocked
                ? 'Unlocking allows configuration changes. Any previously generated hash will be invalidated.'
                : 'Locking prevents configuration changes and generates a tamper-detection hash.',
            type: 'warning',
        });
        if (!confirmed) return;
        setLocking(true);
        try {
            if (isLocked) {
                await api.unlockElection(election.id);
                toast.showSuccess('Election unlocked');
            } else {
                await api.lockElection(election.id);
                toast.showSuccess('Election locked');
            }
            onLockToggle();
        } catch (err) {
            await alertModal.showAlert({ title: 'Failed', message: err.message, type: 'error' });
        } finally {
            setLocking(false);
        }
    };

    const handleEditSaved = () => {
        setShowEdit(false);
        onStatusChange(); // triggers parent refresh to pull updated election data
    };

    const formatDate = (dt) => {
        if (!dt) return '—';
        return new Date(dt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    };

    return (
        <>
            <ConfirmModal {...confirmModal} onConfirm={confirmModal.handleConfirm} onClose={confirmModal.handleClose} {...confirmModal.modalProps} />
            <AlertModal  {...alertModal} onClose={alertModal.handleClose}         {...alertModal.modalProps} />

            <div className={`relative rounded-2xl border-2 transition-all duration-200 bg-white shadow-sm hover:shadow-md ${isActive ? 'border-blue-400 shadow-blue-100' : 'border-slate-200'}`}>
                {isActive && (
                    <div className="absolute -top-px left-6 right-6 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full" />
                )}

                <div className="p-6">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                                {election.logo_url && (
                                    <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                                        <img src={election.logo_url} alt={`${election.name} logo`} className="w-full h-full object-contain p-0.5" />
                                    </div>
                                )}
                                <h3 className="text-xl font-bold text-slate-900 truncate">{election.name}</h3>
                                <StatusBadge status={election.status} />
                                {election.is_locked && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full border border-amber-200">
                                        <Lock className="h-3 w-3" /> Locked
                                    </span>
                                )}
                                {isActive && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                                        Active
                                    </span>
                                )}
                            </div>
                            {election.description && (
                                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{election.description}</p>
                            )}
                            <StatusTimeline status={election.status} />
                        </div>
                    </div>

                    {/* Date row */}
                    <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
                        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                            <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Opens</p>
                                <p className="font-medium text-slate-700">{formatDate(election.opens_at)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                            <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Closes</p>
                                <p className="font-medium text-slate-700">{formatDate(election.closes_at)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Action row */}
                    <div className="flex flex-wrap items-center gap-2">
                        {!isActive && (
                            <button onClick={() => onSelect(election)}
                                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-sm">
                                <Zap className="h-4 w-4" /> Set Active
                            </button>
                        )}

                        {/* Edit button */}
                        <button
                            onClick={() => { setShowEdit(v => !v); setShowRoll(false); }}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border-2 transition-all ${showEdit
                                ? 'border-blue-400 text-blue-700 bg-blue-50'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                            <Edit3 className="h-4 w-4" />
                            Edit
                            {showEdit ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        <button onClick={handleLockToggle} disabled={locking}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border-2 transition-all disabled:opacity-50 ${election.is_locked
                                ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            {locking
                                ? <RefreshCw className="h-4 w-4 animate-spin" />
                                : election.is_locked
                                    ? <><Unlock className="h-4 w-4" /> Unlock</>
                                    : <><Lock className="h-4 w-4" /> Lock</>
                            }
                        </button>

                        <button
                            onClick={() => { setShowRoll(v => !v); setShowEdit(false); }}
                            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border-2 transition-all ${showRoll
                                ? 'border-indigo-400 text-indigo-700 bg-indigo-50'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <Users className="h-4 w-4" />
                            Voter Roll
                            {showRoll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        {nextStatus && (
                            <button onClick={handleTransition} disabled={transitioning}
                                className={`ml-auto flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50 ${TRANSITION_COLORS[nextStatus]}`}>
                                {transitioning
                                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                                    : <>{TRANSITION_LABELS[nextStatus]}<ChevronRight className="h-4 w-4" /></>
                                }
                            </button>
                        )}

                        {status === 'PUBLISHED' && (
                            <span className="ml-auto flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-purple-600 bg-purple-50 rounded-xl border-2 border-purple-200">
                                <Archive className="h-4 w-4" /> Archived
                            </span>
                        )}
                    </div>

                    {/* Inline edit form */}
                    {showEdit && (
                        <ElectionEditForm
                            election={election}
                            onSaved={handleEditSaved}
                            onCancel={() => setShowEdit(false)}
                        />
                    )}

                    {/* Voter roll panel */}
                    {showRoll && (
                        <VoterRollPanel election={election} allElectorates={allElectorates} />
                    )}
                </div>
            </div>
        </>
    );
};

// ---------------------------------------------------------------------------
// Main ElectionManager
// ---------------------------------------------------------------------------

export const ElectionManager = ({ elections, activeElection, electorates = [], onSelect, onUpdate }) => {
    const [showForm, setShowForm] = useState(false);
    const toast = useToast();

    const sorted = useMemo(() => {
        if (!elections.length) return [];
        const priority = { OPEN: 0, READY: 1, DRAFT: 2, CLOSED: 3, PUBLISHED: 4 };
        return [...elections].sort((a, b) =>
            (priority[norm(a.status)] ?? 5) - (priority[norm(b.status)] ?? 5)
        );
    }, [elections]);

    const stats = useMemo(() => ({
        total: elections.length,
        open: elections.filter((e) => norm(e.status) === 'OPEN').length,
        draft: elections.filter((e) => norm(e.status) === 'DRAFT').length,
        closed: elections.filter((e) => ['CLOSED', 'PUBLISHED'].includes(norm(e.status))).length,
    }), [elections]);

    const handleCreated = async (created) => {
        setShowForm(false);
        await onUpdate();
        onSelect(created);
        toast.showSuccess(`"${created.name}" is now the active election`);
    };

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
                .election-manager * { font-family: 'DM Sans', system-ui, sans-serif; }
                @keyframes slideInUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .animate-in { animation: slideInUp 0.35s ease-out both; }
            `}</style>

            <div className="election-manager">
                <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl">
                                <Archive className="h-6 w-6 text-white" />
                            </div>
                            <h2 className="text-3xl font-bold text-slate-900">Elections</h2>
                        </div>
                        <p className="text-sm text-slate-500 ml-14">
                            Create and manage elections, control the voting lifecycle and voter roll
                        </p>
                    </div>
                    <button onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-2.5 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-lg hover:shadow-xl">
                        <Plus className="h-5 w-5" /> New Election
                    </button>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    {[
                        { label: 'Total', value: stats.total, color: 'bg-slate-50  border-slate-200  text-slate-700' },
                        { label: 'Open', value: stats.open, color: 'bg-green-50  border-green-200  text-green-700' },
                        { label: 'Draft', value: stats.draft, color: 'bg-blue-50   border-blue-200   text-blue-700' },
                        { label: 'Archived', value: stats.closed, color: 'bg-purple-50 border-purple-200 text-purple-700' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className={`p-4 rounded-xl border-2 ${color}`}>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">{label}</p>
                            <p className="text-3xl font-bold">{value}</p>
                        </div>
                    ))}
                </div>

                {!activeElection && !showForm && (
                    <div className="mb-6 p-5 bg-amber-50 border-2 border-amber-200 rounded-2xl flex items-start gap-4">
                        <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="font-bold text-amber-900 mb-1">No active election</p>
                            <p className="text-sm text-amber-700">
                                Create your first election below, or select an existing one to enable portfolios, candidates, tokens, and results.
                            </p>
                        </div>
                        <button onClick={() => setShowForm(true)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition-all">
                            <Plus className="h-4 w-4" /> Create
                        </button>
                    </div>
                )}

                {showForm && (
                    <CreateElectionForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
                )}

                {sorted.length === 0 && !showForm ? (
                    <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                        <div className="inline-flex p-5 bg-slate-100 rounded-2xl mb-4">
                            <Archive className="h-16 w-16 text-slate-300" />
                        </div>
                        <p className="text-xl font-semibold text-slate-500 mb-2">No elections yet</p>
                        <p className="text-sm text-slate-400 mb-6">Create your first election to get started</p>
                        <button onClick={() => setShowForm(true)}
                            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg">
                            <Plus className="h-5 w-5" /> Create Election
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {sorted.map((election, i) => (
                            <div key={election.id} className="animate-in" style={{ animationDelay: `${i * 60}ms` }}>
                                <ElectionCard
                                    election={election}
                                    isActive={activeElection?.id === election.id}
                                    onSelect={onSelect}
                                    onStatusChange={onUpdate}
                                    onLockToggle={onUpdate}
                                    allElectorates={electorates}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* Lifecycle guide */}
                <div className="mt-8 p-5 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Election Lifecycle</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        {STATUS_ORDER.map((s, i) => (
                            <div key={s} className="flex items-center gap-2">
                                <StatusBadge status={s} />
                                {i < STATUS_ORDER.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300" />}
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-3">
                        Transitions are one-way. Use the <strong className="text-slate-500">Voter Roll</strong> button on each card to enrol voters — individually or via CSV/Excel bulk upload.
                    </p>
                </div>
            </div>
        </>
    );
};