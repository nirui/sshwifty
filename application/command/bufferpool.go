// Package command implements the command dispatch layer that multiplexes
// multiple logical streams over a single WebSocket connection. It defines the
// wire protocol header format, the finite-state machine (FSM) that drives each
// command, and the handler loop that routes incoming frames to the correct
// stream.
package command

import "sync"

// BufferPool implements a fixed-size byte-slice pool used to reduce allocations
// when reading and writing framed socket messages. All slices returned by Get
// are zeroed before being recycled by Put.
type BufferPool struct {
	pool sync.Pool
}

// NewBufferPool creates a new BufferPool whose slices each have the given size
// in bytes.
func NewBufferPool(size int) BufferPool {
	return BufferPool{
		pool: sync.Pool{
			New: func() any {
				b := make([]byte, size)
				return &b
			},
		},
	}
}

// Get retrieves a zeroed byte slice pointer of the predefined size from the
// pool, allocating a new one if the pool is empty.
func (p *BufferPool) Get() *[]byte {
	return p.pool.Get().(*[]byte)
}

// Put zeroes the buffer contents and returns it to the pool for reuse.
// The caller must not retain any reference to b after calling Put.
func (p *BufferPool) Put(b *[]byte) {
	clear(*b)
	p.pool.Put(b)
}
