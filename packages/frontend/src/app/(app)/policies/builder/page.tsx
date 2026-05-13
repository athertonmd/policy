'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Code, Save } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RuleBuilder, type RuleCondition, type RuleAction } from '@/components/policies/RuleBuilder';
import { DSLEditor } from '@/components/policies/DSLEditor';

type EditorMode = 'visual' | 'dsl';

function BuilderContent() {
  const router = useRouter();
  const [mode, setMode] = useState<EditorMode>('visual');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [conditions, setConditions] = useState<RuleCondition[]>([]);
  const [actions, setActions] = useState<RuleAction[]>([]);
  const [dslValue, setDslValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Convert visual builder state to DSL
  const generateDSL = () => {
    if (conditions.length === 0 || actions.length === 0) return '';

    const conditionStr = conditions
      .map((c) => `${c.field} ${c.operator} "${c.value}"`)
      .join(' and ');

    const actionStr = actions
      .map((a) => a.type)
      .join(', ');

    return `rule "${name || 'Untitled'}" {\n  when ${conditionStr}\n  then ${actionStr}\n}`;
  };

  const handleSave = async () => {
    setIsSaving(true);
    // In production, this calls apiClient.createPolicy()
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    router.push('/policies');
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policy Rule Builder</h1>
          <p className="mt-1 text-sm text-gray-500">Create a new policy rule using the visual builder or DSL editor</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !name}
          className="btn-primary"
          type="button"
        >
          <Save className="mr-1 h-4 w-4" aria-hidden="true" />
          {isSaving ? 'Saving...' : 'Save Rule'}
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
