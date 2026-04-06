import React, { useState, useRef, useEffect } from 'react';
import CustomModal from '../../CustomComponents/CustomModal';
import {
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
  IconAlertCircle,
  IconFile,
  IconLock,
} from '@tabler/icons-react';

const SafeHTMLRenderer = ({ html, className = '' }) => {
  const cleanHTML = (htmlString) => {
    if (!htmlString) return '';

    let cleaned = htmlString;

    cleaned = cleaned.replace(
      /<div[^>]*class=["'][^"']*signature["'][^>]*>[\s\S]*?Regards[\s\S]*?<\/div>/gi,
      ''
    );
    cleaned = cleaned.replace(
      /<div[^>]*id=["'][^"']*signature["'][^>]*>[\s\S]*?Regards[\s\S]*?<\/div>/gi,
      ''
    );

    cleaned = cleaned
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');

    return cleaned;
  };

  const createMarkup = () => {
    let cleanedHTML = cleanHTML(html);

    if (!/<(?:div|p|br|table|ul|li|h[1-6]|html|body)[^>]*>/i.test(cleanedHTML)) {
      cleanedHTML = cleanedHTML.replace(/\r?\n/g, '<br/>');
    }

    return { __html: cleanedHTML };
  };

  return (
    <div
      className={`prose prose-sm prose-slate max-w-none break-words text-slate-700 ${className}`}
      dangerouslySetInnerHTML={createMarkup()}
      style={{
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        lineHeight: '1.6',
      }}
    />
  );
};

export const normalizeRecipients = (recipients) => {
  if (!recipients) return [];

  if (Array.isArray(recipients)) {
    return recipients;
  }

  if (typeof recipients === 'string') {
    try {
      if (recipients.startsWith('[') && recipients.endsWith(']')) {
        const parsed = JSON.parse(recipients.replace(/'/g, '"'));
        return Array.isArray(parsed) ? parsed : [parsed];
      }
      return recipients
        .split(',')
        .map((r) => r.trim())
        .filter((r) => r);
    } catch (error) {
      return [recipients];
    }
  }

  return [];
};

const parseEmailAddress = (addr) => {
  if (!addr) return { name: 'Unknown', email: '' };

  const tupleMatch = addr.match(/\('(.*?)',\s*'(.*?)'\)/);
  if (tupleMatch) {
    return {
      name: tupleMatch[1],
      email: tupleMatch[2],
    };
  }

  const angleMatch = addr.match(/(.*?)\s*<(.*?)>/);
  if (angleMatch) {
    return {
      name: angleMatch[1].trim(),
      email: angleMatch[2].trim(),
    };
  }

  if (addr.includes('@')) {
    return {
      name: addr.split('@')[0],
      email: addr,
    };
  }

  return {
    name: addr,
    email: '',
  };
};

const formatEmailAddress = (addr) => {
  const parsed = parseEmailAddress(addr);
  return (
    <div className="truncate inline-flex items-baseline gap-1.5 max-w-[200px] sm:max-w-xs md:max-w-md">
      <strong className="text-slate-800 font-semibold">{parsed.name}</strong>
      {parsed.email && (
        <span className="text-xs font-medium text-slate-500 truncate">
          {`<${parsed.email}>`}
        </span>
      )}
    </div>
  );
};

const formatDate = (date) => {
  if (!date) return 'Date unknown';

  try {
    const emailDate = new Date(date);
    return emailDate.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return date;
  }
};

const EmailThreadModal = ({ thread, onClose, onViewDocument }) => {
  const [expandedEmails, setExpandedEmails] = useState({});
  const [expandedAddresses, setExpandedAddresses] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('timeline');
  const [copiedText, setCopiedText] = useState(null);
  const contentRef = useRef(null);

  useEffect(() => {
    if (thread?.emails) {
      const initialExpanded = {};
      thread.emails.forEach((_, index) => {
        initialExpanded[index] = true;
      });
      setExpandedEmails(initialExpanded);
    }

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

  const filteredEmails = thread?.emails?.filter((email) => {
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
      className="max-w-7xl w-[98vw] h-[95vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl"
      title="Email Thread Details"
    >
      <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 via-indigo-50/20 to-slate-50">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white/98 backdrop-blur-xl border-b border-slate-200/80 px-6 py-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 via-blue-100 to-cyan-100 flex items-center justify-center border border-indigo-200/60 shadow-lg">
                <IconMail className="text-indigo-600" size={28} stroke={1.5} />
              </div>
              <div>
                <h2 className="font-bold text-2xl text-slate-900 leading-tight">
                  Email Conversation
                </h2>
                <div className="flex items-center gap-3 text-sm text-slate-600 font-medium mt-2 flex-wrap">
                  <span className="flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200/60 shadow-sm">
                    <IconUsers size={16} stroke={1.5} className="text-indigo-600" />
                    <span className="font-bold text-indigo-700">
                      {filteredEmails.length}
                    </span>
                    <span className="text-indigo-600">
                      message{filteredEmails.length !== 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/60 shadow-sm">
                    <IconPaperclip size={16} stroke={1.5} className="text-amber-600" />
                    <span className="font-bold text-amber-700">
                      {totalAttachments}
                    </span>
                    <span className="text-amber-600">
                      file{totalAttachments !== 1 ? 's' : ''}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-end">
              <button
                onClick={toggleAllEmails}
                className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border-2 border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm"
              >
                {Object.values(expandedEmails).every(Boolean)
                  ? 'Collapse All'
                  : 'Expand All'}
              </button>
              <div className="relative group hidden sm:block">
                <IconSearch
                  className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border-2 border-slate-300 rounded-lg w-64 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 transition-all text-sm text-slate-700 placeholder-slate-400 shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* Search Mobile */}
          <div className="relative group sm:hidden mb-2">
            <IconSearch
              className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors"
              size={18}
            />
            <input
              type="text"
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border-2 border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 transition-all text-sm text-slate-700 placeholder-slate-400 shadow-sm"
            />
          </div>

          {/* Thread Subject */}
          <div className="flex flex-wrap items-center gap-3 text-sm bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-cyan-50/80 border-2 border-indigo-200/60 p-4 rounded-xl shadow-sm">
            <IconTag
              size={18}
              className="text-indigo-600 flex-shrink-0"
              stroke={2}
            />
            <span className="font-bold text-slate-800 flex-shrink-0">
              Subject:
            </span>
            <span className="text-indigo-900 font-semibold break-words">
              {thread.emails?.[0]?.subject || thread.threadText || 'Untitled'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-auto p-6 scroll-smooth"
        >
          {viewMode === 'timeline' && (
            <div className="relative pl-10 space-y-6 max-w-6xl mx-auto">
              {/* Timeline Line */}
              <div className="absolute left-[1.35rem] top-8 bottom-0 w-[3px] bg-gradient-to-b from-indigo-400 via-indigo-300 to-transparent rounded-full shadow-lg"></div>

              {filteredEmails.map((email, index) => {
                const isExpanded = expandedEmails[index];
                const isSearchMatch =
                  searchQuery &&
                  ((email.subject?.toLowerCase() || '').includes(
                    searchQuery.toLowerCase()
                  ) ||
                    (
                      email.body_plain?.toLowerCase() ||
                      email.bodyText?.toLowerCase() ||
                      ''
                    ).includes(searchQuery.toLowerCase()));

                const emailAttachments =
                  thread.attachmentsMapping?.filter(
                    (att) =>
                      att.emailSubject === email.subject &&
                      att.emailFrom === email.from &&
                      !att.isThreadContext
                  ) || [];

                return (
                  <div key={index} className="relative group/email">
                    {/* Timeline Dot */}
                    <div className="absolute -left-[2.95rem] top-4 z-20">
                      <div
                        className={`w-11 h-11 rounded-full border-4 flex items-center justify-center text-xs font-bold shadow-xl transition-all duration-300 ${
                          isSearchMatch
                            ? 'bg-amber-400 border-amber-500 text-amber-900 scale-125 ring-4 ring-amber-200'
                            : 'bg-gradient-to-br from-indigo-500 to-indigo-600 border-white text-white group-hover/email:shadow-2xl group-hover/email:scale-110'
                        }`}
                      >
                        {index + 1}
                      </div>
                    </div>

                    {/* Email Card */}
                    <div
                      className={`border-2 rounded-2xl shadow-md overflow-hidden transition-all duration-300 bg-white ${
                        isSearchMatch
                          ? 'border-amber-300 ring-4 ring-amber-100 shadow-xl'
                          : 'border-slate-200 hover:border-indigo-400 hover:shadow-xl hover:ring-1 hover:ring-indigo-200/50'
                      }`}
                    >
                      {/* Email Header */}
                      <div
                        className="p-6 cursor-pointer hover:bg-gradient-to-r hover:from-slate-50 hover:to-indigo-50 transition-colors border-b-2 border-slate-100"
                        onClick={() => toggleEmailExpansion(index)}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            {/* Subject */}
                            <div className="flex items-center gap-3 mb-4 flex-wrap">
                              <h3 className="font-bold text-lg text-slate-900 truncate flex-1">
                                {email.subject || 'No Subject'}
                              </h3>
                              {emailAttachments.length > 0 && (
                                <span className="flex flex-shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border-2 border-amber-200 px-3 py-1.5 rounded-lg shadow-sm">
                                  <IconPaperclip size={14} stroke={2} />
                                  {emailAttachments.length}
                                </span>
                              )}
                            </div>

                            {/* Metadata Grid */}
                            <div className="space-y-3.5">
                              {/* From */}
                              <div className="flex items-center gap-3">
                                <div className="w-16 flex items-center gap-2 text-slate-500 font-bold flex-shrink-0 text-sm">
                                  <IconUser size={16} stroke={2} />
                                  <span>From</span>
                                </div>
                                <div className="flex-1 pl-4 border-l-3 border-indigo-200">
                                  {formatEmailAddress(email.from)}
                                </div>
                              </div>

                              {/* To/CC/BCC */}
                              {email.to &&
                                (() => {
                                  const recipients = normalizeRecipients(
                                    email.to
                                  );
                                  const ccRecipients = normalizeRecipients(
                                    email.cc
                                  );
                                  const bccRecipients = normalizeRecipients(
                                    email.bcc
                                  );
                                  const isAddressExpanded =
                                    expandedAddresses[index];
                                  const visibleRecipients = isAddressExpanded
                                    ? recipients
                                    : recipients.slice(0, 2);
                                  const totalRecipients =
                                    recipients.length +
                                    ccRecipients.length +
                                    bccRecipients.length;

                                  return (
                                    <div className="space-y-3 ml-0">
                                      {/* To */}
                                      <div className="flex items-start gap-3">
                                        <div className="w-16 flex items-center gap-2 text-slate-500 font-bold flex-shrink-0 text-sm mt-1">
                                          <IconAt size={16} stroke={2} />
                                          <span>To</span>
                                        </div>
                                        <div className="flex-1 pl-4 border-l-3 border-indigo-200 flex flex-wrap items-center gap-2">
                                          {visibleRecipients.map((addr, i) => (
                                            <div
                                              key={`${addr}-${i}`}
                                              className="bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg text-sm shadow-sm"
                                            >
                                              {formatEmailAddress(addr)}
                                            </div>
                                          ))}
                                          {totalRecipients > 2 && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedAddresses(
                                                  (prev) => ({
                                                    ...prev,
                                                    [index]: !prev[index],
                                                  })
                                                );
                                              }}
                                              className="px-3 py-1.5 font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg transition-colors text-xs border border-indigo-300 shadow-sm"
                                            >
                                              {isAddressExpanded
                                                ? 'Show less'
                                                : `+${totalRecipients - 2}`}
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* CC */}
                                      {isAddressExpanded &&
                                        ccRecipients?.length > 0 && (
                                          <div className="flex items-start gap-3">
                                            <div className="w-16 flex items-center gap-2 text-slate-500 font-bold flex-shrink-0 text-sm mt-1">
                                              <IconAt size={16} stroke={2} />
                                              <span>Cc</span>
                                            </div>
                                            <div className="flex-1 pl-4 border-l-3 border-blue-200 flex flex-wrap gap-2">
                                              {ccRecipients.map((addr, i) => (
                                                <div
                                                  key={`cc-${addr}-${i}`}
                                                  className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-sm shadow-sm"
                                                >
                                                  {formatEmailAddress(addr)}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                      {/* BCC */}
                                      {isAddressExpanded &&
                                        bccRecipients?.length > 0 && (
                                          <div className="flex items-start gap-3">
                                            <div className="w-16 flex items-center gap-2 text-slate-500 font-bold flex-shrink-0 text-sm mt-1">
                                              <IconLock size={16} stroke={2} />
                                              <span>Bcc</span>
                                            </div>
                                            <div className="flex-1 pl-4 border-l-3 border-slate-300 flex flex-wrap gap-2">
                                              {bccRecipients.map((addr, i) => (
                                                <div
                                                  key={`bcc-${addr}-${i}`}
                                                  className="bg-slate-100 border border-slate-300 px-3 py-1.5 rounded-lg text-sm shadow-sm"
                                                >
                                                  {formatEmailAddress(addr)}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                    </div>
                                  );
                                })()}

                              {/* Date */}
                              <div className="flex items-center gap-3">
                                <div className="w-16 flex items-center gap-2 text-slate-500 font-bold flex-shrink-0 text-sm">
                                  <IconCalendar size={16} stroke={2} />
                                  <span>Date</span>
                                </div>
                                <div className="flex-1 pl-4 border-l-3 border-green-200">
                                  <span className="font-semibold text-slate-800 bg-green-50 px-3 py-1.5 rounded-lg inline-block border border-green-200 shadow-sm">
                                    {formatDate(email.date)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expand/Collapse Icon */}
                          <div
                            className={`p-2.5 rounded-lg transition-all flex-shrink-0 ${
                              isExpanded
                                ? 'bg-indigo-100 text-indigo-600 shadow-md'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600'
                            }`}
                          >
                            {isExpanded ? (
                              <IconChevronUp size={24} stroke={2} />
                            ) : (
                              <IconChevronDown size={24} stroke={2} />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="border-t-2 border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
                          {/* Email Body */}
                          {(email.body_plain ||
                            email.body_html ||
                            email.bodyText ||
                            email.body_text) && (
                            <div className="p-6">
                              <div className="flex items-center justify-between mb-4 pb-4 border-b-2 border-slate-200">
                                <h4 className="font-bold text-slate-600 uppercase tracking-widest text-xs">
                                  📧 Message Body
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
                                    setTimeout(
                                      () => setCopiedText(null),
                                      2000
                                    );
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border-2 border-indigo-200 shadow-sm"
                                >
                                  {copiedText === 'Email content' ? (
                                    <>
                                      <IconCheck
                                        size={16}
                                        stroke={2}
                                        className="text-green-600"
                                      />
                                      Copied
                                    </>
                                  ) : (
                                    <>
                                      <IconCopy size={16} stroke={2} />
                                      Copy
                                    </>
                                  )}
                                </button>
                              </div>
                              <div className="max-h-[450px] overflow-y-auto pr-3 custom-scrollbar">
                                <div className="bg-white p-5 rounded-xl border-2 border-slate-200 shadow-sm">
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

                          {/* Attachments */}
                          {emailAttachments.length > 0 && (
                            <div className="p-6 border-t-2 border-slate-100">
                              <div className="flex items-center gap-2 mb-4">
                                <IconPaperclip
                                  size={20}
                                  className="text-amber-600"
                                  stroke={2}
                                />
                                <h4 className="font-bold text-slate-800 text-base">
                                  Attachments ({emailAttachments.length})
                                </h4>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {emailAttachments.map((attachment, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-4 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-xl border-2 border-amber-200 hover:border-amber-300 hover:shadow-lg transition-all group/att shadow-sm"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="p-2.5 bg-amber-100 text-amber-600 rounded-lg group-hover/att:bg-amber-600 group-hover/att:text-white transition-colors flex-shrink-0 shadow-sm">
                                        <IconFileText
                                          size={20}
                                          stroke={1.5}
                                        />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="font-semibold text-sm text-slate-800 truncate">
                                          {attachment.originalFilename ||
                                            attachment.filename}
                                        </p>
                                        <p className="text-xs font-medium text-slate-500 mt-1">
                                          {attachment.size
                                            ? `${(
                                                attachment.size / 1024
                                              ).toFixed(1)} KB`
                                            : 'Size unknown'}
                                        </p>
                                      </div>
                                    </div>
                                    {onViewDocument &&
                                      attachment.documentId && (
                                        <button
                                          onClick={() =>
                                            onViewDocument(
                                              attachment.documentId
                                            )
                                          }
                                          className="p-2 text-amber-600 hover:text-white hover:bg-amber-600 rounded-lg transition-all flex-shrink-0 shadow-sm"
                                          title="View Document"
                                        >
                                          <IconEye
                                            size={18}
                                            stroke={1.5}
                                          />
                                        </button>
                                      )}
                                  </div>
                                ))}
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

          {viewMode === 'compact' && (
            <div className="space-y-4 max-w-6xl mx-auto">
              {filteredEmails.map((email, index) => {
                const emailAttachments =
                  thread.attachmentsMapping?.filter(
                    (att) =>
                      att.emailSubject === email.subject &&
                      att.emailFrom === email.from &&
                      !att.isThreadContext
                  ) || [];

                return (
                  <div
                    key={index}
                    className="border-2 border-slate-200 rounded-xl p-5 hover:border-indigo-400 hover:shadow-lg transition-all bg-white shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-3 flex-1 min-w-0">
                        <h4 className="font-bold text-lg text-slate-900 truncate">
                          {email.subject || 'No Subject'}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <IconUser
                              size={16}
                              className="text-slate-500"
                              stroke={1.5}
                            />
                            <strong className="text-slate-700">From:</strong>
                            <span className="truncate max-w-[200px] text-slate-600">
                              {formatEmailAddress(email.from)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <IconCalendar
                              size={16}
                              className="text-slate-500"
                              stroke={1.5}
                            />
                            <strong className="text-slate-700">Date:</strong>
                            <span className="text-slate-600">
                              {formatDate(email.date)}
                            </span>
                          </div>
                          {emailAttachments.length > 0 && (
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg font-semibold text-xs border-2 border-amber-200 shadow-sm">
                              <IconPaperclip size={14} stroke={1.5} />
                              {emailAttachments.length} att.
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleEmailExpansion(index)}
                        className="px-4 py-2 text-sm font-bold text-indigo-700 bg-indigo-50 border-2 border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
                      >
                        {expandedEmails[index] ? 'Collapse' : 'Expand'}
                        {expandedEmails[index] ? (
                          <IconChevronUp size={18} stroke={2} />
                        ) : (
                          <IconChevronDown size={18} stroke={2} />
                        )}
                      </button>
                    </div>

                    {expandedEmails[index] &&
                      (email.body_plain ||
                        email.bodyText ||
                        email.body_text) && (
                        <div className="mt-4 p-4 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm text-slate-700 max-h-40 overflow-y-auto leading-relaxed shadow-sm">
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

          {/* Thread Context PDF Section */}
          {/* {thread.attachmentsMapping?.some((att) => att.isThreadContext) && (
            <div className="mt-10 max-w-6xl mx-auto">
              <div className="bg-gradient-to-r from-indigo-100 via-blue-100 to-cyan-100 border-3 border-indigo-400 rounded-2xl p-6 shadow-xl">
                <div className="flex items-start gap-4">
                  <div className="p-4 bg-indigo-200 text-indigo-700 rounded-xl flex-shrink-0 shadow-lg">
                    <IconAlertCircle size={32} stroke={2} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-indigo-900 text-lg mb-2">
                      📄 Complete Thread Context PDF
                    </h3>
                    <p className="text-sm text-indigo-800 mb-4 leading-relaxed">
                      A professionally formatted PDF document containing the entire
                      email thread conversation with all messages in chronological
                      order, complete metadata, and full context for your reference
                      and documentation.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {thread.attachmentsMapping
                        ?.filter((att) => att.isThreadContext)
                        .map((contextPdf, idx) => (
                          <button
                            key={idx}
                            onClick={() =>
                              onViewDocument &&
                              onViewDocument(contextPdf.documentId)
                            }
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 hover:shadow-lg transition-all shadow-md text-sm"
                          >
                            <IconDownload size={18} stroke={2} />
                            View Thread PDF
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )} */}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-20 border-t-2 border-slate-200 bg-white/98 backdrop-blur-xl px-6 py-4 shadow-lg">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm font-medium text-slate-700">
              Showing{' '}
              <span className="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg inline-block">
                {filteredEmails.length}
              </span>{' '}
              of{' '}
              <span className="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg inline-block">
                {thread.emails?.length}
              </span>{' '}
              emails
              {searchQuery && (
                <span className="text-indigo-600 ml-1.5 font-bold">
                  (filtered: "{searchQuery}")
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap justify-end">
              <button
                onClick={() =>
                  setViewMode(viewMode === 'timeline' ? 'compact' : 'timeline')
                }
                className="flex items-center justify-center gap-2 px-5 py-2 text-sm font-bold border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all shadow-sm"
              >
                {viewMode === 'timeline' ? (
                  <IconMinimize size={18} stroke={2} className="text-slate-500" />
                ) : (
                  <IconMaximize size={18} stroke={2} className="text-slate-500" />
                )}
                {viewMode === 'timeline' ? 'Compact' : 'Timeline'}
              </button>
              <button
                onClick={onClose}
                className="px-8 py-2 font-bold text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 hover:shadow-lg transition-all shadow-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: #cbd5e1;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background-color: #94a3b8;
          }
        `,
      }} />
    </CustomModal>
  );
};

export default EmailThreadModal;