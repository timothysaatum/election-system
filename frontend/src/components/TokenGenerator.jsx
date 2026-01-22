import { useState } from 'react';
import { Send, Key, RefreshCw } from 'lucide-react';
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

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <ConfirmModal {...confirmModal} onConfirm={confirmModal.handleConfirm} onClose={confirmModal.handleClose} {...confirmModal.modalProps} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Token Generation</h2>

        {/* Options */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">Generation Options</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Election Name
              </label>
              <input
                type="text"
                value={options.election_name}
                onChange={(e) => setOptions({ ...options, election_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={options.send_notifications}
                  onChange={(e) => setOptions({ ...options, send_notifications: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Send Notifications</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={options.exclude_voted}
                  onChange={(e) => setOptions({ ...options, exclude_voted: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Exclude Already Voted</span>
              </label>
            </div>

            {options.send_notifications && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notification Methods
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={options.notification_methods.includes('email')}
                      onChange={(e) => {
                        const methods = e.target.checked
                          ? [...options.notification_methods, 'email']
                          : options.notification_methods.filter(m => m !== 'email');
                        setOptions({ ...options, notification_methods: methods });
                      }}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Email</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={options.notification_methods.includes('sms')}
                      onChange={(e) => {
                        const methods = e.target.checked
                          ? [...options.notification_methods, 'sms']
                          : options.notification_methods.filter(m => m !== 'sms');
                        setOptions({ ...options, notification_methods: methods });
                      }}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">SMS</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
            {generating ? 'Generating...' : 'Generate for All Eligible Voters'}
          </button>

          {selectedVoters.length > 0 && (
            <button
              onClick={handleGenerateSelected}
              disabled={generating}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <Key className="h-5 w-5" />
              Generate for {selectedVoters.length} Selected
            </button>
          )}
        </div>

        {/* Result Display */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-green-900 mb-2">Generation Complete!</h3>
            <div className="text-sm text-green-800 space-y-1">
              <p>✓ Tokens Generated: {result.generated_tokens}</p>
              <p>✓ Notifications Sent: {result.notifications_sent || 0}</p>
              {result.failed_notifications > 0 && (
                <p className="text-orange-600">⚠ Failed Notifications: {result.failed_notifications}</p>
              )}
            </div>
          </div>
        )}

        {/* Voter Selection List */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Voters</h3>
            <span className="text-sm text-gray-600">
              {selectedVoters.length} selected
            </span>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVoters(electorates.map(v => v.id));
                        } else {
                          setSelectedVoters([]);
                        }
                      }}
                      checked={selectedVoters.length === electorates.length && electorates.length > 0}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Student ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Program
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {electorates.map((voter) => (
                  <tr key={voter.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedVoters.includes(voter.id)}
                        onChange={() => toggleVoterSelection(voter.id)}
                        className="h-4 w-4 text-blue-600 rounded"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {voter.student_id}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {voter.program || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {voter.phone_number || 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRegenerateToken(voter.id)}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
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
        </div>
      </div>
    </>
  );
};