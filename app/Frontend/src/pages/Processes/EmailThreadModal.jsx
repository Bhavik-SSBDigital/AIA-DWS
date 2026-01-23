import React, { useState, useRef, useEffect } from 'react';
import CustomModal from '../../CustomComponents/CustomModal';
import CustomButton from '../../CustomComponents/CustomButton';
import {
  IconX,
  IconMail,
  IconUser,
  IconClock,
  IconPaperclip,
  IconAt,
  IconCalendar,
  IconDownload,
  IconChevronDown,
  IconChevronUp,
  IconSearch,
  IconCopy,
  IconEye,
  IconFileText,
  IconUsers,
  IconTag,
  IconMaximize,
  IconMinimize,
  IconCheck,
  IconPrinter,
} from '@tabler/icons-react';

const SafeHTMLRenderer = ({ html, className = '' }) => {
  const cleanHTML = (htmlString) => {
    if (!htmlString) return '';

    let cleaned = htmlString;

    // Remove signature div if it contains "Regards" pattern
    cleaned = cleaned.replace(
      /<div[^>]*class=["'][^"']*signature["'][^>]*>[\s\S]*?Regards[\s\S]*?<\/div>/gi,
      '',
    );
    cleaned = cleaned.replace(
      /<div[^>]*id=["'][^"']*signature["'][^>]*>[\s\S]*?Regards[\s\S]*?<\/div>/gi,
      '',
    );

    // Remove mailer signatures
    cleaned = cleaned.replace(
      /<div[^>]*gmail_signature["'][^>]*>[\s\S]*?<\/div>/gi,
      '',
    );
    cleaned = cleaned.replace(
      /<div[^>]*gmail_extra["'][^>]*>[\s\S]*?<\/div>/gi,
      '',
    );

    // Basic HTML sanitization
    cleaned = cleaned
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');

    return cleaned;
  };

  const createMarkup = () => {
    const cleanedHTML = cleanHTML(html);
    return { __html: cleanedHTML };
  };

  return (
    <div
      className={`prose prose-sm max-w-none break-words overflow-auto ${className}`}
      dangerouslySetInnerHTML={createMarkup()}
      style={{
        maxHeight: '400px',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
      }}
    />
  );
};

const EmailThreadModal = ({ thread, onClose, onViewDocument }) => {
  const [expandedEmails, setExpandedEmails] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('timeline');
  const [copiedText, setCopiedText] = useState(null);
  const contentRef = useRef(null);

  // Initialize all emails as expanded by default
  useEffect(() => {
    if (thread?.emails) {
      const initialExpanded = {};
      thread.emails.forEach((_, index) => {
        initialExpanded[index] = true;
      });
      setExpandedEmails(initialExpanded);
    }

    // Auto-scroll to top when modal opens
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [thread]);

  const toggleEmailExpansion = (index) => {
    setExpandedEmails((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const toggleAllEmails = () => {
    const allExpanded = Object.values(expandedEmails).every(Boolean);
    const newExpanded = {};
    thread.emails.forEach((_, index) => {
      newExpanded[index] = !allExpanded;
    });
    setExpandedEmails(newExpanded);
  };

  const formatDate = (date) => {
    if (!date) return 'Date unknown';

    try {
      const now = new Date();
      const emailDate = new Date(date);
      const diffTime = Math.abs(now - emailDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return `Today at ${emailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else if (diffDays === 1) {
        return `Yesterday at ${emailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else if (diffDays <= 7) {
        return `${diffDays} days ago`;
      }
      return emailDate.toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return date;
    }
  };

  // Parse email address from various formats
  const parseEmailAddress = (addr) => {
    if (!addr) return { name: 'Unknown', email: '' };

    // Format 1: "('Bhavik Bhatt', 'bhavik.bhatt@ssbi.in')"
    const tupleMatch = addr.match(/\('(.*?)',\s*'(.*?)'\)/);
    if (tupleMatch) {
      return {
        name: tupleMatch[1],
        email: tupleMatch[2],
      };
    }

    // Format 2: "Name <email@domain.com>"
    const angleMatch = addr.match(/(.*?)\s*<(.*?)>/);
    if (angleMatch) {
      return {
        name: angleMatch[1].trim(),
        email: angleMatch[2].trim(),
      };
    }

    // Format 3: Just email
    if (addr.includes('@')) {
      return {
        name: addr.split('@')[0],
        email: addr,
      };
    }

    // Default
    return {
      name: addr,
      email: '',
    };
  };

  const formatEmailAddress = (addr) => {
    const parsed = parseEmailAddress(addr);
    return (
      <div className="truncate">
        <strong className="text-gray-800">{parsed.name}</strong>
        {parsed.email && (
          <div className="text-xs text-gray-500 truncate">
            &lt;{parsed.email}&gt;
          </div>
        )}
      </div>
    );
  };

  // Normalize recipients - handle array or string
  const normalizeRecipients = (recipients) => {
    if (!recipients) return [];

    if (Array.isArray(recipients)) {
      return recipients;
    }

    // Try to parse string representation of array
    if (typeof recipients === 'string') {
      try {
        // Handle format like "['recipient1@domain.com', 'recipient2@domain.com']"
        if (recipients.startsWith('[') && recipients.endsWith(']')) {
          const parsed = JSON.parse(recipients.replace(/'/g, '"'));
          return Array.isArray(parsed) ? parsed : [parsed];
        }
        // Handle format like "recipient1@domain.com, recipient2@domain.com"
        return recipients
          .split(',')
          .map((r) => r.trim())
          .filter((r) => r);
      } catch (error) {
        // If parsing fails, return as single item array
        return [recipients];
      }
    }

    return [];
  };

  const filteredEmails =
    thread?.emails?.filter((email) => {
      if (!searchQuery.trim()) return true;
      const searchLower = searchQuery.toLowerCase();

      const emailText =
        email.body_plain || email.bodyText || email.body_text || '';
      const toRecipients = normalizeRecipients(email.to);
      const ccRecipients = normalizeRecipients(email.cc);

      return (
        (email.subject?.toLowerCase() || '').includes(searchLower) ||
        (email.from?.toLowerCase() || '').includes(searchLower) ||
        emailText.toLowerCase().includes(searchLower) ||
        toRecipients.some((to) => to.toLowerCase().includes(searchLower)) ||
        ccRecipients.some((cc) => cc.toLowerCase().includes(searchLower))
      );
    }) || [];

  const totalAttachments = thread?.attachmentsMapping?.length || 0;

  if (!thread) return null;

  return (
    <CustomModal
      isOpen={!!thread}
      onClose={onClose}
      className="max-w-6xl w-[95vw] h-[90vh] flex flex-col"
      title="Email Thread Details"
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <IconMail className="text-blue-600" size={22} />
              </div>
              <div>
                <h2 className="font-bold text-xl text-gray-900">
                  Email Conversation
                </h2>
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <IconUsers size={14} />
                    {filteredEmails.length} email
                    {filteredEmails.length !== 1 ? 's' : ''}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <IconPaperclip size={14} />
                    {totalAttachments} attachment
                    {totalAttachments !== 1 ? 's' : ''}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleAllEmails}
                className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
              >
                {Object.values(expandedEmails).every(Boolean)
                  ? 'Collapse All'
                  : 'Expand All'}
              </button>
              <div className="relative">
                <IconSearch
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Search in emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Thread info bar */}
          <div className="flex flex-wrap items-center gap-4 text-sm bg-blue-50 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <IconTag size={16} className="text-blue-600" />
              <span className="font-medium">Thread:</span>
              <span className="text-blue-700 truncate max-w-xs">
                {thread.emails?.[0]?.subject ||
                  thread.threadText ||
                  'Untitled Thread'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <IconUser size={16} className="text-blue-600" />
              <span className="font-medium">Extracted at:</span>
              <span>
                {thread.extractedAt
                  ? formatDate(thread.extractedAt)
                  : 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-auto p-6">
          {/* Timeline View */}
          {viewMode === 'timeline' && (
            <div className="relative pl-8 space-y-8">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

              {filteredEmails.map((email, index) => {
                const isExpanded = expandedEmails[index];
                const isSearchMatch =
                  searchQuery &&
                  ((email.subject?.toLowerCase() || '').includes(
                    searchQuery.toLowerCase(),
                  ) ||
                    (
                      email.body_plain?.toLowerCase() ||
                      email.bodyText?.toLowerCase() ||
                      ''
                    ).includes(searchQuery.toLowerCase()));

                // Get email-specific attachments from attachmentsMapping
                const emailAttachments =
                  thread.attachmentsMapping?.filter(
                    (att) =>
                      att.emailSubject === email.subject &&
                      att.emailFrom === email.from,
                  ) ||
                  email.attachments_filenames?.map((filename) => ({
                    filename,
                    originalFilename: filename,
                  })) ||
                  [];

                return (
                  <div key={index} className="relative">
                    {/* Timeline dot */}
                    <div className="absolute -left-8 top-0">
                      <div
                        className={`w-6 h-6 rounded-full border-4 border-white ${isSearchMatch ? 'bg-orange-500' : 'bg-blue-500'}`}
                      ></div>
                    </div>

                    {/* Email Card */}
                    <div
                      className={`border rounded-xl shadow-sm overflow-hidden transition-all duration-200 ${
                        isSearchMatch ? 'ring-2 ring-orange-200' : ''
                      } bg-white`}
                    >
                      {/* Header */}
                      <div
                        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => toggleEmailExpansion(index)}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <IconMail size={16} className="text-gray-500" />
                              <h3 className="font-semibold text-gray-800 truncate">
                                {email.subject || 'No Subject'}
                              </h3>
                              {emailAttachments.length > 0 && (
                                <span className="flex items-center gap-1 text-sm text-gray-500 bg-white px-2 py-0.5 rounded-full">
                                  <IconPaperclip size={12} />
                                  {emailAttachments.length}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-gray-600">
                                  <IconUser size={14} />
                                  <span className="font-medium">From:</span>
                                </div>
                                <div className="text-gray-800 pl-6">
                                  {formatEmailAddress(email.from)}
                                </div>
                              </div>

                              {email.to && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-gray-600">
                                    <IconAt size={14} />
                                    <span className="font-medium">To:</span>
                                  </div>
                                  <div className="text-gray-800 pl-6 truncate">
                                    {normalizeRecipients(email.to)
                                      .slice(0, 2)
                                      .map((addr, idx) => (
                                        <div key={idx}>
                                          {formatEmailAddress(addr)}
                                        </div>
                                      ))}
                                    {normalizeRecipients(email.to).length > 2 &&
                                      ` +${normalizeRecipients(email.to).length - 2} more`}
                                  </div>
                                </div>
                              )}

                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-gray-600">
                                  <IconCalendar size={14} />
                                  <span className="font-medium">Date:</span>
                                </div>
                                <div className="text-gray-800 pl-6">
                                  {formatDate(email.date)}
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-gray-600">
                                  <IconClock size={14} />
                                  <span className="font-medium">Index:</span>
                                </div>
                                <div className="text-gray-800 pl-6">
                                  {index + 1} of {filteredEmails.length}
                                </div>
                              </div>
                            </div>
                          </div>

                          <button className="ml-4 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                            {isExpanded ? (
                              <IconChevronUp size={20} />
                            ) : (
                              <IconChevronDown size={20} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="border-t p-4 bg-gray-50">
                          {/* Attachments */}
                          {/* {emailAttachments.length > 0 && (
                            <div className="mb-4">
                              <div className="flex items-center gap-2 mb-3">
                                <IconPaperclip size={18} className="text-gray-600" />
                                <h4 className="font-medium text-gray-700">Attachments ({emailAttachments.length})</h4>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {emailAttachments.map((attachment, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-white rounded-lg border hover:bg-gray-100 transition-colors"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <IconFileText size={20} className="text-gray-500 flex-shrink-0" />
                                      <div className="min-w-0">
                                        <p className="font-medium text-sm text-gray-800 truncate">
                                          {attachment.originalFilename || attachment.filename}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {attachment.size ? `${(attachment.size / 1024).toFixed(1)} KB` : 'Size unknown'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {onViewDocument && attachment.documentId && (
                                        <button
                                          onClick={() => onViewDocument(attachment.documentId)}
                                          className="p-1.5 hover:bg-gray-200 rounded"
                                          title="View Document"
                                        >
                                          <IconEye size={16} />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => {
                                          // Handle download
                                          console.log('Download attachment:', attachment);
                                        }}
                                        className="p-1.5 hover:bg-gray-200 rounded"
                                        title="Download"
                                      >
                                        <IconDownload size={16} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )} */}

                          {/* Email Body */}
                          {(email.body_plain ||
                            email.body_html ||
                            email.bodyText ||
                            email.body_text) && (
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium text-gray-700">
                                  Email Content
                                </h4>
                                <button
                                  onClick={() => {
                                    const text =
                                      email.body_plain ||
                                      email.bodyText ||
                                      email.body_text ||
                                      '';
                                    navigator.clipboard.writeText(text);
                                    setCopiedText('Email content');
                                    setTimeout(() => setCopiedText(null), 2000);
                                  }}
                                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                                >
                                  {copiedText === 'Email content' ? (
                                    <>
                                      <IconCheck size={16} />
                                      Copied!
                                    </>
                                  ) : (
                                    <>
                                      <IconCopy size={16} />
                                      Copy text
                                    </>
                                  )}
                                </button>
                              </div>
                              <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-hidden">
                                <div className="max-h-[400px] overflow-y-auto">
                                  <SafeHTMLRenderer
                                    html={
                                      email.body_html ||
                                      email.body_plain ||
                                      email.bodyText ||
                                      email.body_text
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Compact View */}
          {viewMode === 'compact' && (
            <div className="space-y-4">
              {filteredEmails.map((email, index) => {
                const emailAttachments =
                  thread.attachmentsMapping?.filter(
                    (att) =>
                      att.emailSubject === email.subject &&
                      att.emailFrom === email.from,
                  ) || [];

                return (
                  <div
                    key={index}
                    className="border rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <h4 className="font-medium">
                          {email.subject || 'No Subject'}
                        </h4>
                        <div className="text-sm text-gray-600">
                          <p>
                            <strong>From:</strong> {email.from}
                          </p>
                          <p>
                            <strong>Date:</strong> {formatDate(email.date)}
                          </p>
                          {emailAttachments.length > 0 && (
                            <p className="flex items-center gap-1">
                              <IconPaperclip size={12} />
                              <strong>
                                {emailAttachments.length} attachment(s)
                              </strong>
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleEmailExpansion(index)}
                        className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
                      >
                        {expandedEmails[index] ? 'Collapse' : 'Expand'}
                      </button>
                    </div>

                    {expandedEmails[index] &&
                      (email.body_plain ||
                        email.bodyText ||
                        email.body_text) && (
                        <div className="mt-3 p-3 bg-gray-50 rounded text-sm max-h-40 overflow-y-auto">
                          {(
                            email.body_plain ||
                            email.bodyText ||
                            email.body_text ||
                            ''
                          ).substring(0, 300)}
                          {(
                            email.body_plain ||
                            email.bodyText ||
                            email.body_text ||
                            ''
                          ).length > 300
                            ? '...'
                            : ''}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {filteredEmails.length} of {thread.emails?.length} emails
              {searchQuery && ` (filtered by "${searchQuery}")`}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  setViewMode(viewMode === 'timeline' ? 'compact' : 'timeline')
                }
                className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                {viewMode === 'timeline' ? (
                  <IconMinimize size={18} />
                ) : (
                  <IconMaximize size={18} />
                )}
                {viewMode === 'timeline' ? 'Compact View' : 'Timeline View'}
              </button>
              <CustomButton
                variant="primary"
                text="Close"
                click={onClose}
                className="px-6"
              />
            </div>
          </div>
        </div>
      </div>
    </CustomModal>
  );
};

export default EmailThreadModal;
