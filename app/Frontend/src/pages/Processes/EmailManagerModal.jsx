import React, { useState, useEffect, useRef } from 'react';
import { IconMail, IconSend, IconUsers, IconX, IconPlus } from '@tabler/icons-react';
import CustomModal from '../../CustomComponents/CustomModal';
import CustomButton from '../../CustomComponents/CustomButton';
import { toast } from 'react-toastify';
import { getSentEmails, sendManualEmail, getAllUniqueEmails } from '../../common/Apis';

export default function EmailManagerModal({ isOpen, onClose, processId, processName }) {
  const [activeTab, setActiveTab] = useState('send'); // 'send', 'history'
  
  // Data states
  const [sentEmailsHistory, setSentEmailsHistory] = useState([]);
  const [globalUniqueEmails, setGlobalUniqueEmails] = useState([]); 
  
  // Send email form states
  const [currentSendList, setCurrentSendList] = useState([]); 
  const [emailInput, setEmailInput] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false); // New state for custom dropdown
  
  const [subject, setSubject] = useState(''); // Modified: Start empty
  const [body, setBody] = useState('');
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [sending, setSending] = useState(false);

  const wrapperRef = useRef(null);

  const fetchData = async () => {
    try {
      const [sentEmailsRes, uniqueEmailsRes] = await Promise.all([
        getSentEmails(processId),
        getAllUniqueEmails() 
      ]);
      setSentEmailsHistory(sentEmailsRes.data.sentEmails || []);
      setGlobalUniqueEmails(uniqueEmailsRes.data.uniqueEmails || []);
    } catch (error) {
      toast.error("Failed to load email data");
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setCurrentSendList([]);
      setEmailInput('');
      setSubject(''); // Modified: Start empty when opened
      setBody('');
    }
  }, [isOpen, processId]);

  // Handle clicking outside the custom dropdown to close it
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Handlers for building the send list ---
  const handleAddEmailToList = (emailToAdd = emailInput) => {
    const email = emailToAdd.trim();
    if (!email) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Invalid email format");
      return;
    }
    if (currentSendList.includes(email)) {
      toast.warning("Email is already in your send list");
      return;
    }
    
    setCurrentSendList(prev => [...prev, email]);
    setEmailInput(''); 
    setIsDropdownOpen(false);
  };

  const handleRemoveFromList = (emailToRemove) => {
    setCurrentSendList(prev => prev.filter(email => email !== emailToRemove));
  };

  const handleSendEmailBlast = async () => {
    if (currentSendList.length === 0) {
      toast.error("Please add at least one recipient to the list");
      return;
    }
    // Added safety check for empty subject
    if (!subject || subject.trim() === '') {
      toast.error("Please enter a subject");
      return;
    }
    
    setSending(true);
    try {
      await sendManualEmail(processId, {
        recipientEmails: currentSendList, 
        subject,
        body,
        includeAttachments
      });
      
      toast.success("Emails sent successfully!");
      
      setCurrentSendList([]);
      setSubject(''); // Reset subject back to empty on success
      setBody('');
      fetchData();
      setActiveTab('history');
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send emails");
    } finally {
      setSending(false);
    }
  };

  // Filter available emails based on what the user is typing
  const filteredEmails = globalUniqueEmails.filter(
    email => 
      email.toLowerCase().includes(emailInput.toLowerCase()) && 
      !currentSendList.includes(email)
  );

  return (
    <CustomModal isOpen={isOpen} onClose={onClose} className="max-w-2xl w-full rounded-2xl">
      <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600 shadow-sm">
              <IconMail size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Process Emails</h2>
              <p className="text-xs text-slate-500">{processName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white border border-slate-200 rounded-full hover:bg-slate-50">
            <IconX size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          <button
            className={`py-3 px-4 font-medium text-sm transition-colors flex items-center ${activeTab === 'send' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('send')}
          >
            <IconSend size={16} className="mr-2" /> Send Email
          </button>
          <button
            className={`py-3 px-4 font-medium text-sm transition-colors flex items-center ${activeTab === 'history' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('history')}
          >
            <IconUsers size={16} className="mr-2" /> Recipients who got the mail
          </button>
        </div>

        <div className="p-6">
          
          {/* TAB 1: SEND EMAIL */}
          {activeTab === 'send' && (
            <div className="space-y-5">
              
              {/* Build the Recipient List */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="block text-sm font-bold text-slate-700 mb-2">Build Recipient List</label>
                
                <div className="flex gap-2 mb-3">
                  {/* Custom Autocomplete Wrapper */}
                  <div className="relative flex-1" ref={wrapperRef}>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      placeholder="Type a new email or search history..."
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddEmailToList();
                        }
                      }}
                    />
                    
                    {/* Custom Dropdown Menu */}
                    {isDropdownOpen && filteredEmails.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 shadow-lg rounded-lg max-h-48 overflow-y-auto py-1">
                        {filteredEmails.map(email => (
                          <li 
                            key={email}
                            onClick={() => handleAddEmailToList(email)}
                            className="px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer transition-colors"
                          >
                            {email}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <button 
                    onClick={() => handleAddEmailToList(emailInput)}
                    className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 flex items-center gap-1 text-sm font-medium transition-colors"
                  >
                    <IconPlus size={16}/> Add
                  </button>
                </div>

                {/* Display pending list */}
                {currentSendList.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {currentSendList.map(email => (
                      <div key={email} className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full border border-indigo-100 text-sm font-medium">
                        <span>{email}</span>
                        <button 
                          onClick={() => handleRemoveFromList(email)} 
                          className="text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 p-0.5 rounded-full transition-colors"
                        >
                          <IconX size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No recipients added yet. Add emails above to build your list.</p>
                )}
              </div>

              {/* Email Content */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter a subject for this email"
                  required
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Additional Message (Optional)</label>
                <textarea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Type any extra information you want to include in the email body..."
                />
              </div>
              
              <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  id="includeAttachments"
                  checked={includeAttachments}
                  onChange={(e) => setIncludeAttachments(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="includeAttachments" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Attach latest process documents
                </label>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <CustomButton variant="secondary" text="Cancel" click={onClose} />
                <CustomButton 
                  variant="primary" 
                  text={sending ? "Sending..." : `Send to ${currentSendList.length} recipient(s)`} 
                  click={handleSendEmailBlast} 
                  disabled={sending || currentSendList.length === 0 || subject.trim() === ''} 
                />
              </div>
            </div>
          )}

          {/* TAB 2: RECIPIENTS WHO GOT THE MAIL */}
          {activeTab === 'history' && (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {sentEmailsHistory.length === 0 && (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-100 border-dashed text-slate-500">
                  <IconMail className="mx-auto mb-2 text-slate-400" size={32} />
                  <p>No emails have been sent for this process yet.</p>
                </div>
              )}
              
              {sentEmailsHistory.map(emailLog => (
                <div key={emailLog.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:shadow transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${emailLog.status === 'SENT' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <p className="font-bold text-slate-800">{emailLog.recipientEmail}</p>
                    </div>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      {new Date(emailLog.sentAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                  
                  <div className="pl-4 border-l-2 border-slate-100 ml-1 mt-2 space-y-1">
                    <p className="text-sm text-slate-600 truncate"><span className="font-medium">Subject:</span> {emailLog.subject}</p>
                    {emailLog.attachments?.length > 0 && (
                      <p className="text-xs text-indigo-600 font-medium mt-1">
                        📎 {emailLog.attachments.length} attachment(s) included
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </CustomModal>
  );
}