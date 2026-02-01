import { useState } from 'react';
import { Send, Key, RefreshCw, CheckCircle, AlertCircle, Mail, MessageSquare } from 'lucide-react';
import { api } from '../services/api';
import { ConfirmModal, AlertModal } from './Modal';
import { ToastContainer } from './Toast';
import { useModal } from '../hooks/useModal';
import { useToast } from '../hooks/useToast';

export const TokenGenerator = ({ electorates, onUpdate }) => {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedVoters, setSelectedVoters] = useState([]);
  const [options, setOptions] = useState({
    election_name: 'SRC Election 2024',
    send_notifications: true,
    notification_methods: ['email', 'sms'],
    exclude_voted: true,
  });

  const confirmModal = useModal();
  const alertModal = useModal();
  const toast = useToast();

  const handleGenerateAll = async () => {
    const confirmed = await confirmModal.showConfirm({
      title: 'Generate Tokens for All',
      message: 'Generate tokens for all eligible voters?',
      type: 'info'
    });

    if (!confirmed) return;

    setGenerating(true);
    setResult(null);

    try {
      const data = await api.generateTokensForAll(options);
      setResult(data);
      onUpdate();

      toast.showSuccess(`Successfully generated ${data.generated_tokens} tokens${data.notifications_sent ? ` and sent ${data.notifications_sent} notifications` : ''}`);
    } catch (err) {
      await alertModal.showAlert({
        title: 'Token Generation Failed',
        message: err.message,
        type: 'error'
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateSelected = async () => {
    if (selectedVoters.length === 0) {
      await alertModal.showAlert({
        title: 'No Voters Selected',
        message: 'Please select at least one voter',
        type: 'error'
      });
      return;
    }

    const confirmed = await confirmModal.showConfirm({
      title: 'Generate Selected Tokens',
      message: `Generate tokens for ${selectedVoters.length} selected voters?`,
      type: 'info'
    });

    if (!confirmed) return;

    setGenerating(true);
    setResult(null);

    try {
      const data = await api.generateTokensForElectorates(selectedVoters, options);
      setResult(data);
      setSelectedVoters([]);
      onUpdate();

      toast.showSuccess(`Successfully generated ${data.generated_tokens} tokens${data.notifications_sent ? ` and sent ${data.notifications_sent} notifications` : ''}`);
    } catch (err) {
      await alertModal.showAlert({
        title: 'Token Generation Failed',
        message: err.message,
        type: 'error'
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateToken = async (electorateId) => {
    const confirmed = await confirmModal.showConfirm({
      title: 'Regenerate Token',
      message: 'Regenerate token for this voter?',
      type: 'warning'
    });

    if (!confirmed) return;

    try {
      await api.regenerateTokenForElectorate(electorateId, options);
      onUpdate();

      toast.showSuccess('Token regenerated successfully');
    } catch (err) {
      await alertModal.showAlert({
        title: 'Regeneration Failed',
        message: err.message,
        type: 'error'
      });
    }
  };

  const toggleVoterSelection = (voterId) => {
    setSelectedVoters(prev =>
      prev.includes(voterId)
        ? prev.filter(id => id !== voterId)
        : [...prev, voterId]
    );
  };

  const selectAll = (checked) => {
    if (checked) {
      setSelectedVoters(electorates.map(v => v.id));
    } else {
      setSelectedVoters([]);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        
        * {
          font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        @keyframes pulse-success {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        
        .success-result {
          animation: pulse-success 2s ease-in-out infinite;
        }
        
        .voter-row {
          transition: all 0.2s ease;
        }
        
        .voter-row:hover {
          background-color: rgb(248 250 252);
        }
        
        .voter-row.selected {
          background-color: rgb(239 246 255);
        }
      `}</style>

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <ConfirmModal {...confirmModal} onConfirm={confirmModal.handleConfirm} onClose={confirmModal.handleClose} {...confirmModal.modalProps} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      <div className="bg-gradient-to-br from-white via-indigo-50/30 to-white rounded-2xl shadow-xl p-6 border border-slate-200">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg">
            <Key className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Token Generation</h2>
            <p className="text-sm text-slate-600">Generate and distribute voting tokens to electorates</p>
          </div>
        </div>

        {/* Options Card */}
        <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl p-6 mb-6 border-2 border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
            <span className="h-2 w-2 bg-indigo-600 rounded-full"></span>
            Generation Options
          </h3>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Election Name
              </label>
              <input
                type="text"
                value={options.election_name}
                onChange={(e) => setOptions({ ...options, election_name: e.target.value })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                placeholder="e.g., SRC Election 2024"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center p-4 bg-white rounded-xl border-2 border-slate-200 hover:border-indigo-300 transition-all cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.send_notifications}
                  onChange={(e) => setOptions({ ...options, send_notifications: e.target.checked })}
                  className="h-5 w-5 text-indigo-600 rounded border-slate-300 focus:ring-2 focus:ring-indigo-500"
                />
                <div className="ml-3 flex items-center gap-2">
                  <Send className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-slate-700">Send Notifications</span>
                </div>
              </label>

              <label className="flex items-center p-4 bg-white rounded-xl border-2 border-slate-200 hover:border-indigo-300 transition-all cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.exclude_voted}
                  onChange={(e) => setOptions({ ...options, exclude_voted: e.target.checked })}
                  className="h-5 w-5 text-indigo-600 rounded border-slate-300 focus:ring-2 focus:ring-indigo-500"
                />
                <div className="ml-3 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-slate-700">Exclude Already Voted</span>
                </div>
              </label>
            </div>

            {options.send_notifications && (
              <div className="p-4 bg-white rounded-xl border-2 border-indigo-200">
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Notification Methods
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex items-center p-3 bg-slate-50 rounded-lg hover:bg-indigo-50 transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.notification_methods.includes('email')}
                      onChange={(e) => {
                        const methods = e.target.checked
                          ? [...options.notification_methods, 'email']
                          : options.notification_methods.filter(m => m !== 'email');
                        setOptions({ ...options, notification_methods: methods });
                      }}
                      className="h-4 w-4 text-indigo-600 rounded border-slate-300"
                    />
                    <div className="ml-2 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-medium text-slate-700">Email</span>
                    </div>
                  </label>
                  <label className="flex items-center p-3 bg-slate-50 rounded-lg hover:bg-indigo-50 transition-all cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.notification_methods.includes('sms')}
                      onChange={(e) => {
                        const methods = e.target.checked
                          ? [...options.notification_methods, 'sms']
                          : options.notification_methods.filter(m => m !== 'sms');
                        setOptions({ ...options, notification_methods: methods });
                      }}
                      className="h-4 w-4 text-indigo-600 rounded border-slate-300"
                    />
                    <div className="ml-2 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-medium text-slate-700">SMS</span>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-6 py-3 rounded-xl hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg hover:shadow-xl"
          >
            <Send className="h-5 w-5" />
            {generating ? 'Generating...' : 'Generate for All Eligible Voters'}
          </button>

          {selectedVoters.length > 0 && (
            <button
              onClick={handleGenerateSelected}
              disabled={generating}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-3 rounded-xl hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg hover:shadow-xl"
            >
              <Key className="h-5 w-5" />
              Generate for {selectedVoters.length} Selected
            </button>
          )}
        </div>

        {/* Result Display */}
        {result && (
          <div className="success-result bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-200 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-700" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-green-900 mb-3 text-lg">Generation Complete!</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle className="h-4 w-4" />
                    <span><strong>{result.generated_tokens}</strong> tokens generated</span>
                  </div>
                  <div className="flex items-center gap-2 text-green-800">
                    <Send className="h-4 w-4" />
                    <span><strong>{result.notifications_sent || 0}</strong> notifications sent</span>
                  </div>
                  {result.failed_notifications > 0 && (
                    <div className="flex items-center gap-2 text-orange-700 col-span-2">
                      <AlertCircle className="h-4 w-4" />
                      <span><strong>{result.failed_notifications}</strong> notification failures</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Voter Selection List */}
        <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
          <div className="flex justify-between items-center p-4 bg-slate-50 border-b-2 border-slate-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="h-2 w-2 bg-indigo-600 rounded-full"></span>
              Voters
            </h3>
            <span className="text-sm font-semibold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">
              {selectedVoters.length} selected
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-slate-50 to-indigo-50">
                <tr>
                  <th className="px-5 py-4 text-left">
                    <input
                      type="checkbox"
                      onChange={(e) => selectAll(e.target.checked)}
                      checked={selectedVoters.length === electorates.length && electorates.length > 0}
                      className="h-5 w-5 text-indigo-600 rounded border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Student ID
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Program
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {electorates.map((voter) => (
                  <tr
                    key={voter.id}
                    className={`voter-row ${selectedVoters.includes(voter.id) ? 'selected' : ''}`}
                  >
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={selectedVoters.includes(voter.id)}
                        onChange={() => toggleVoterSelection(voter.id)}
                        className="h-5 w-5 text-indigo-600 rounded border-slate-300 focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-900">
                      {voter.student_id}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {voter.program || 'N/A'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {voter.phone_number || 'N/A'}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleRegenerateToken(voter.id)}
                        className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-sm font-medium hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
                        title="Regenerate Token"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Regenerate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {electorates.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Key className="h-16 w-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg font-medium">No voters available</p>
              <p className="text-sm mt-1">Add voters to generate tokens</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};