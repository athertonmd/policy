'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, DollarSign, User, AlertTriangle, MessageSquare } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface WorkflowDetail {
  id: string;
  workflowId: string;
  type: 'booking' | 'override' | 'budget_exception';
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  traveller: { id: string; name: string; department: string; email: string; grade: string };
  trip: {
    destination: string;
    origin: string;
    dates: string;
    amount: number;
    currency: string;
    cabinClass: string;
    airline: string;
    purpose: string;
  };
  policyViolations: string[];
  submittedAt: string;
  dueBy?: string;
  assignedTo?: string;
  approvalHistory: { action: string; by: string; at: string; comment?: string }[];
  policyDecision: { result: string; reasons: string[]; alternatives: string[] };
}

// Mock workflow detail
const MOCK_WORKFLOW: WorkflowDetail = {
  id: 'wf-001',
  workflowId: 'wf-001',
  type: 'booking',
  status: 'pending',
  traveller: {
    id: 'u-001',
    name: 'James Smith',
    department: 'Engineering',
    email: 'james.smith@company.com',
    grade: 'Senior Engineer',
  },
  trip: {
    destination: 'New York, USA',
    origin: 'London, UK',
    dates: '15-18 Mar 2024',
    amount: 2450,
    currency: 'GBP',
    cabinClass: 'Economy',
    airline: 'British Airways',
    purpose: 'Client meeting with Acme Corp',
  },
  policyViolations: ['Exceeds international flight cap of £2,000'],
  submittedAt: '2024-03-10T09:30:00Z',
  dueBy: '2024-03-12T09:30:00Z',
  assignedTo: 'approver@company.com',
  approvalHistory: [
    { action: 'Submitted', by: 'james.smith@company.com', at: '2024-03-10T09:30:00Z' },
    { action: 'Assigned', by: 'system', at: '2024-03-10T09:31:00Z', comment: 'Auto-assigned to line manager' },
  ],
  policyDecision: {
    result: 'flag',
    reasons: ['Trip amount £2,450 exceeds international cap of £2,000 by £450'],
    alternatives: ['Economy flex fare at £1,850', 'Alternative dates (22-25 Mar) at £1,920'],
  },
};

function WorkflowDetailContent() {
  const router = useRouter();
  const params = useParams();
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workflow] = useState<WorkflowDetail>(MOCK_WORKFLOW);

  const handleAction = async (action: 'approve' | 'reject' | 'request_info' | 'escalate') => {
    setIsSubmitting(true);
    // In production, calls apiClient.submitApprovalAction()
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSubmitting(false);
    router.push('/approvals');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/approvals')}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
          type="button"
          aria-label="Back to approvals"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Approval Request</h1>
            <StatusBadge status={workflow.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Workflow {workflow.workflowId} · Submitted {new Date(workflow.submittedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Trip details */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Trip Details</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-gray-500">Destination</dt>
                <dd className="mt-1 flex items-center gap-1 text-sm text-gray-900">
                  <MapPin className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  {workflow.trip.origin} → {workflow.trip.destination}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Dates</dt>
                <dd className="mt-1 flex items-center gap-1 text-sm text-gray-900">
                  <Clock className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  {workflow.trip.dates}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Amount</dt>
                <dd className="mt-1 flex items-center gap-1 text-sm text-gray-900">
                  <DollarSign className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  {workflow.trip.currency} {workflow.trip.amount.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Cabin Class</dt>
                <dd className="mt-1 text-sm text-gray-900">{workflow.trip.cabinClass}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Airline</dt>
                <dd className="mt-1 text-sm text-gray-900">{workflow.trip.airline}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Purpose</dt>
                <dd className="mt-1 text-sm text-gray-900">{workflow.trip.purpose}</dd>
              </div>
            </dl>
          </div>

          {/* Policy violations */}
          {workflow.policyViolations.length > 0 && (
            <div className="card border-red-200 bg-red-50">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-red-900">Policy Violations</h2>
              </div>
              <ul className="space-y-2">
                {workflow.policyViolations.map((violation, idx) => (
                  <li key={idx} className="text-sm text-red-700">• {violation}</li>
                ))}
              </ul>
              {workflow.policyDecision.reasons.length > 0 && (
                <div className="mt-3 border-t border-red-200 pt-3">
                  <p className="text-xs font-medium text-red-800">Decision details:</p>
                  {workflow.policyDecision.reasons.map((reason, idx) => (
                    <p key={idx} className="mt-1 text-xs text-red-700">{reason}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Alternatives */}
          {workflow.policyDecision.alternatives.length > 0 && (
            <div className="card border-blue-200 bg-blue-50">
              <h2 className="text-lg font-semibold text-blue-900 mb-3">Suggested Alternatives</h2>
              <ul className="space-y-2">
                {workflow.policyDecision.alternatives.map((alt, idx) => (
                  <li key={idx} className="text-sm text-blue-700">• {alt}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action section */}
          {workflow.status === 'pending' && (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Take Action</h2>
              <div className="mb-4">
                <label htmlFor="action-comment" className="block text-sm font-medium text-gray-700">
                  Comment (optional)
                </label>
                <textarea
                  id="action-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  className="input-field mt-1"
                  placeholder="Add a comment for the traveller..."
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAction('approve')}
                  disabled={isSubmitting}
                  className="btn-success"
                  type="button"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction('reject')}
                  disabled={isSubmitting}
                  className="btn-danger"
                  type="button"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAction('request_info')}
                  disabled={isSubmitting}
                  className="btn-secondary"
                  type="button"
                >
                  <MessageSquare className="mr-1 h-4 w-4" aria-hidden="true" />
                  Request Info
                </button>
                <button
                  onClick={() => handleAction('escalate')}
                  disabled={isSubmitting}
                  className="btn-secondary"
                  type="button"
                >
                  Escalate
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Traveller info */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Traveller</h3>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-medium" aria-hidden="true">
                {workflow.traveller.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{workflow.traveller.name}</p>
                <p className="text-xs text-gray-500">{workflow.traveller.grade}</p>
                <p className="text-xs text-gray-500">{workflow.traveller.department}</p>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Approval History</h3>
            <ol className="relative border-l border-gray-200 ml-3 space-y-4">
              {workflow.approvalHistory.map((event, idx) => (
                <li key={idx} className="ml-4">
                  <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-gray-400" aria-hidden="true" />
                  <p className="text-sm font-medium text-gray-900">{event.action}</p>
                  <p className="text-xs text-gray-500">
                    {event.by} · {new Date(event.at).toLocaleString()}
                  </p>
                  {event.comment && (
                    <p className="mt-1 text-xs text-gray-600 italic">{event.comment}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* Due date */}
          {workflow.dueBy && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">SLA Deadline</h3>
              <p className="text-sm text-gray-700">
                {new Date(workflow.dueBy).toLocaleString()}
              </p>
              {new Date(workflow.dueBy) < new Date() && (
                <p className="mt-1 text-xs text-red-600 font-medium">SLA breached</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkflowDetailPage() {
  return (
    <ProtectedRoute requiredCapability="view_approvals">
      <WorkflowDetailContent />
    </ProtectedRoute>
  );
}
