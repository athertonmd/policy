import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../App';

describe('App', () => {
  it('renders without crashing in mock mode', () => {
    render(<App />);
    expect(screen.getByText('Mock Mode')).toBeInTheDocument();
  });

  it('displays all 5 mock fare cards', () => {
    render(<App />);
    const fareCards = screen.getAllByTestId('fare-card');
    expect(fareCards).toHaveLength(5);
  });

  it('renders green badges with correct styling', () => {
    render(<App />);
    const greenBadges = screen.getAllByTestId('badge-green');
    expect(greenBadges).toHaveLength(2);
    greenBadges.forEach((badge) => {
      expect(badge).toHaveClass('bg-green-100', 'text-green-800');
    });
  });

  it('renders amber badges with correct styling', () => {
    render(<App />);
    const amberBadges = screen.getAllByTestId('badge-amber');
    expect(amberBadges).toHaveLength(2);
    amberBadges.forEach((badge) => {
      expect(badge).toHaveClass('bg-amber-100', 'text-amber-800');
    });
  });

  it('renders red badges with correct styling', () => {
    render(<App />);
    const redBadges = screen.getAllByTestId('badge-red');
    expect(redBadges).toHaveLength(1);
    redBadges.forEach((badge) => {
      expect(badge).toHaveClass('bg-red-100', 'text-red-800');
    });
  });

  it('shows traveller name "James Smith"', () => {
    render(<App />);
    expect(screen.getByText('James Smith')).toBeInTheDocument();
  });

  it('shows connection status as "Mock Mode"', () => {
    render(<App />);
    expect(screen.getByText('Mock Mode')).toBeInTheDocument();
  });

  it('shows MockControlPanel in mock mode', () => {
    render(<App />);
    expect(screen.getByTestId('mock-control-panel')).toBeInTheDocument();
    expect(screen.getByText('Load Sample Fares')).toBeInTheDocument();
  });

  it('MockControlPanel clears and reloads fares', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.queryAllByTestId('fare-card')).toHaveLength(0);
    fireEvent.click(screen.getByText('Load Sample Fares'));
    expect(screen.getAllByTestId('fare-card')).toHaveLength(5);
  });
});

describe('App - Message Bridge Integration', () => {
  it('shows Simulate INIT and route scenario buttons', () => {
    render(<App />);
    expect(screen.getByText('Simulate INIT')).toBeInTheDocument();
    expect(screen.getByText('LHR → JFK')).toBeInTheDocument();
    expect(screen.getByText('MAN → DXB')).toBeInTheDocument();
    expect(screen.getByText('LHR → SIN')).toBeInTheDocument();
  });

  it('Simulate INIT updates connection state to connected', async () => {
    render(<App />);
    expect(screen.getByText('Mock Mode')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Simulate INIT'));
    });

    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });

  it('LHR → JFK button loads fares from bridge message', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('LHR → JFK'));
    });

    await waitFor(() => {
      const fareCards = screen.getAllByTestId('fare-card');
      expect(fareCards).toHaveLength(5);
    });
  });
});

describe('Agent Search Simulation', () => {
  it('Clicking LHR → JFK updates search summary', async () => {
    render(<App />);

    expect(screen.queryByTestId('search-summary')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('LHR → JFK'));
    });

    await waitFor(() => {
      const summary = screen.getByTestId('search-summary');
      expect(summary).toBeInTheDocument();
      expect(summary.textContent).toContain('LHR');
      expect(summary.textContent).toContain('JFK');
      expect(summary.textContent).toContain('5 fares evaluated');
    });
  });

  it('Clicking MAN → DXB updates search summary', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('MAN → DXB'));
    });

    await waitFor(() => {
      const summary = screen.getByTestId('search-summary');
      expect(summary).toBeInTheDocument();
      expect(summary.textContent).toContain('MAN');
      expect(summary.textContent).toContain('DXB');
      expect(summary.textContent).toContain('4 fares evaluated');
    });
  });

  it('Clicking LHR → SIN updates search summary', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('LHR → SIN'));
    });

    await waitFor(() => {
      const summary = screen.getByTestId('search-summary');
      expect(summary).toBeInTheDocument();
      expect(summary.textContent).toContain('LHR');
      expect(summary.textContent).toContain('SIN');
      expect(summary.textContent).toContain('5 fares evaluated');
    });
  });

  it('Clear Search removes fares and summary', async () => {
    render(<App />);

    // First load a scenario
    await act(async () => {
      fireEvent.click(screen.getByText('LHR → JFK'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('search-summary')).toBeInTheDocument();
    });

    // Then clear
    await act(async () => {
      fireEvent.click(screen.getByText('Clear Search'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('search-summary')).not.toBeInTheDocument();
      expect(screen.queryAllByTestId('fare-card')).toHaveLength(0);
    });
  });

  it('LHR → JFK scenario produces 5 fare cards', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('LHR → JFK'));
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('fare-card')).toHaveLength(5);
    });
  });

  it('MAN → DXB scenario produces 4 fare cards', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('MAN → DXB'));
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('fare-card')).toHaveLength(4);
    });
  });

  it('LHR → SIN scenario produces 5 fare cards', async () => {
    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByText('LHR → SIN'));
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('fare-card')).toHaveLength(5);
    });
  });
});

describe('Pre-Ticket Gate', () => {
  function dispatchEndTransaction(amount: number, pnr = 'TEST-PNR') {
    window.postMessage(
      {
        type: 'END_TRANSACTION',
        payload: {
          pnrLocator: pnr,
          totalCost: { amount, currency: 'GBP' },
          travellerId: 'trav-001',
        },
        correlationId: 'test-end-txn',
        timestamp: Date.now(),
      },
      '*'
    );
  }

  it('END_TRANSACTION message shows PreTicketGate component', async () => {
    render(<App />);
    expect(screen.queryByTestId('pre-ticket-gate')).not.toBeInTheDocument();

    await act(async () => {
      dispatchEndTransaction(1500);
    });

    await waitFor(() => {
      expect(screen.getByTestId('pre-ticket-gate')).toBeInTheDocument();
    });
  });

  it('Compliant transaction shows proceed action', async () => {
    render(<App />);

    await act(async () => {
      dispatchEndTransaction(1500);
    });

    await waitFor(() => {
      const actionEl = screen.getByTestId('pre-ticket-action');
      expect(actionEl).toHaveAttribute('data-action', 'proceed');
    });
  });

  it('Hold transaction shows hold action', async () => {
    render(<App />);

    await act(async () => {
      dispatchEndTransaction(3000);
    });

    await waitFor(() => {
      const actionEl = screen.getByTestId('pre-ticket-action');
      expect(actionEl).toHaveAttribute('data-action', 'hold');
    });
  });

  it('Block transaction shows block action', async () => {
    render(<App />);

    await act(async () => {
      dispatchEndTransaction(6000);
    });

    await waitFor(() => {
      const actionEl = screen.getByTestId('pre-ticket-action');
      expect(actionEl).toHaveAttribute('data-action', 'block');
    });
  });

  it('Dismiss button clears the gate', async () => {
    render(<App />);

    await act(async () => {
      dispatchEndTransaction(1500);
    });

    await waitFor(() => {
      expect(screen.getByTestId('pre-ticket-gate')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('pre-ticket-dismiss'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('pre-ticket-gate')).not.toBeInTheDocument();
    });
  });
});
