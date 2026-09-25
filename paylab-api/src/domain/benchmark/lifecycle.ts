export type RunStatus = 'RUNNING' | 'COMPLETED' | 'INCOMPLETE'

// A Run starts RUNNING and leaves it exactly once. Terminal states are immutable.
export function canTransition(from: RunStatus, to: RunStatus): boolean {
	return from === 'RUNNING' && to !== 'RUNNING'
}
