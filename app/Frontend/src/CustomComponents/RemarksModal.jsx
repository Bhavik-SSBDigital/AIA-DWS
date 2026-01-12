import React, { useState, useEffect } from 'react';
import CustomModal from './CustomModal';
import CustomButton from './CustomButton';

const RemarksModal = ({
  open,
  title,
  onSubmit,
  onClose,
  loading,
  showPassField,
  remarksOptional = false,
}) => {
  const [remark, setRemark] = useState('');
  const [dscPass, setDscPass] = useState('');

  useEffect(() => {
    if (!open) {
      setRemark('');
      setDscPass('');
    }
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (remarksOptional) {
      onSubmit(remark.trim());
      return;
    }

    if (!remark.trim()) return;
    if (showPassField && !dscPass.trim()) return;

    const payload = showPassField
      ? { p12password: dscPass.trim(), remarks: remark.trim() }
      : remark.trim();
    onSubmit(payload);
  };

  return (
    <CustomModal isOpen={open} onClose={onClose} className="w-96">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <form onSubmit={handleSubmit}>
        <textarea
          className="w-full p-2 border rounded-lg focus:outline-none"
          rows="4"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Enter your remarks here..."
          required
        />

        {showPassField && (
          <input
            type="password"
            className="w-full p-2 mt-4 border rounded-lg focus:outline-none"
            placeholder="Enter DSC Password"
            value={dscPass}
            onChange={(e) => setDscPass(e.target.value)}
            required
          />
        )}

        <div className="flex justify-end mt-4 space-x-2">
          <CustomButton
            disabled={loading}
            type="button"
            text="Cancel"
            variant="danger"
            click={onClose}
          />
          <CustomButton disabled={loading} text="Submit" type="submit" />
        </div>
      </form>
    </CustomModal>
  );
};

export default RemarksModal;
