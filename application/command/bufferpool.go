package command

import "sync"

// BufferPool implements a pool of buffer for reading and writing socket
// messages
type BufferPool struct {
	pool sync.Pool
}

// NewBufferPool creates a new BufferPool
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

// Get returns a buffer of predefined size
func (p *BufferPool) Get() *[]byte {
	return p.pool.Get().(*[]byte)
}

// Put puts the buffer back to current BufferPool
func (p *BufferPool) Put(b *[]byte) {
	clear(*b)
	p.pool.Put(b)
}
