'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, Code, Save } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RuleBuilder, type RuleCondition, type RuleAction } from '@/components/policies/RuleBuilder';
import { DSLEditor } from '@/components/policies/DSLEditor';
import { policyApi } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const POLICY_API_URL = process.env.NEXT_PUBLIC_POLICY_API_URL || '';

type EditorMode = 'visual' | 'dsl';

function BuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editRuleId = searchParams.get('edit');
  const isEditMode = !!editRuleId;

  const [mode, setMode] = useState<EditorMode>(isEditMode ? 'dsl' : 'visual');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [conditions, setConditions] = useState<RuleCondition[]>([]);
  const [actions, setActions] = useState<RuleAction[]>([]);
  const [dslValue, setDslValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditMode);

  // Load existing rule in edit mode
  useEffect(() => {
    if (!editRuleId) return;

    const loadRule = async () => {
      try {
        const token = getAccessToken();
        const response = await fetch(`${POLICY_API_URL}/v1/policies/rules`, {
          headers: { 'Authorization': token || '', 'x-tenant-id': 'tenant-001' },
        });
        if (!response.ok) throw new Error('Failed to load rule');
        const data = await response.json();
        const items = data.data?.items || data.items || [];
        const rule = items.find((r: any) => r.ruleId === editRuleId);
        if (rule) {
          setName(rule.name);
          setDescription(rule.description || '');
          setDslValue(rule.dslSource || '');
          setMode('dsl');
        }
      } catch (err) {
        console.error('Failed to load rule for editing:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadRule();
  }, [editRuleId]);

  // Convert visual builder state to DSL matching the parser format
  const generateDSL = () => {
    if (conditions.length === 0 || actions.length === 0) return '';

    // Map UI operators to DSL operators
    const operatorMap: Record<string, string> = {
      equals: '==',
      not_equals: '!=',
      greater_than: '>',
      less_than: '<',
      contains: 'contains',
      in: 'in',
    };

    const conditionStr = conditions
      .map((c) => {
        const op = operatorMap[c.operator] || '==';
        // Numeric values don't need quotes
        const isNumeric = !isNaN(Number(c.value)) && c.value.trim() !== '';
        const val = isNumeric ? c.value : `"${c.value}"`;
        return `${c.field} ${op} ${val}`;
      })
      .join('\n  and ');

    // Map UI action types to DSL actions
    const actionStr = actions
      .map((a) => {
        switch (a.type) {
          case 'approve':
            return 'approve';
          case 'reject':
            return 'reject with reason "Policy violation"';
          case 'flag':
            return 'warn with reason "Flagged for review"';
          case 'require_approval':
            return 'require approval';
          case 'notify':
            return 'warn with reason "Notification required"';
          default:
            return 'warn with reason "Unknown action"';
        }
      })
      .join('\n  ');

    return `rule "${name || 'Untitled'}"\npriority 100\nwhen ${conditionStr}\nthen ${actionStr}`;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const dsl = mode === 'dsl' ? dslValue : generateDSL();

      if (isEditMode && editRuleId) {
        // Update existing rule
        const token = getAccessToken();
        const response = await fetch(`${POLICY_API_URL}/v1/policies/rules/${editRuleId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token || '',
            'x-tenant-id': 'tenant-001',
          },
          body: JSON.stringify({ name, description: description || undefined, dslSource: dsl, priority: 100 }),
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || `Update failed (${response.status})`);
        }
      } else {
        // Create new rule
        await policyApi.createPolicy({
          name,
          description: description || undefined,
          dslSource: dsl,
          priority: 100,
        });
      }
      router.push('/policies');
    } catch (error: any) {
      console.error('Failed to save policy:', error);
      alert(error?.message || 'Failed to save policy. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditMode ? 'Edit Policy Rule' : 'Policy Rule Builder'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isEditMode ? 'Modify the policy rule and save changes' : 'Create a new policy rule using the visual builder or DSL editor'}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !name}
          className="btn-primary"
          type="button"
        >
          <Save className="mr-1 h-4 w-4" aria-hidden="true" />
          {isSaving ? 'Saving...' : isEditMode ? 'Update Rule' : 'Save Rule'}
        </button>
      </div>

      {/* Rule metadata */}
      <div className="mt-6 card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rule-name" className="block text-sm font-medium text-gray-700">
              Rule Name
            </label>
            <input
              id="rule-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field mt-1"
              placeholder="e.g., International Flight Cap"
            />
          </div>
          <div>
            <label htmlFor="rule-description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <input
              id="rule-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field mt-1"
              placeholder="Brief description of what this rule does"
            />
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mt-6 flex items-center gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setMode('visual')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'visual'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          aria-pressed={mode === 'visual'}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Visual Builder
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('dsl');
            setDslValue(generateDSL());
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'dsl'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          aria-pressed={mode === 'dsl'}
        >
          <Code className="h-4 w-4" aria-hidden="true" />
          DSL Editor
        </button>
      </div>

      {/* Editor content */}
      <div className="mt-6 card">
        {mode === 'visual' ? (
          <RuleBuilder
            conditions={conditions}
            actions={actions}
            onConditionsChange={setConditions}
            onActionsChange={setActions}
          />
        ) : (
          <DSLEditor
            value={dslValue}
            onChange={setDslValue}
          />
        )}
      </div>

      {/* Preview */}
      {mode === 'visual' && conditions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Generated DSL Preview</h3>
          <pre className="rounded-md bg-gray-900 p-4 text-sm text-green-400 overflow-x-auto">
            {generateDSL() || '// Add conditions and actions to generate DSL'}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function PolicyBuilderPage() {
  return (
    <ProtectedRoute requiredCapability="edit_policies">
      <BuilderContent />
    </ProtectedRoute>
  );
}
