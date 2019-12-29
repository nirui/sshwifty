// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2020 Rui NI <nirui@gmx.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package rw

import "errors"

// Errors
var (
	ErrFetchReaderNotEnoughBuffer = errors.New(
		"Not enough buffer")
)

// FetchReaderFetcher generates data for SourceReader
type FetchReaderFetcher func() ([]byte, error)

// FetchReader read from the source and increase your lifespan if used correctly
type FetchReader struct {
	source   FetchReaderFetcher // Source data fetcher
	data     []byte             // Fetched source data
	dataUsed int                // Used source data
}

// Fetch fetchs
type Fetch func(n int) ([]byte, error)

// FetchOneByte fetchs one byte from the Fetch, or return an error when it fails
func FetchOneByte(f Fetch) ([]byte, error) {
	for {
		d, dErr := f(1)

		if dErr != nil {
			return nil, dErr
		}

		if len(d) <= 0 {
			continue
		}

		return d, nil
	}
}

// NewFetchReader creates a new FetchReader
func NewFetchReader(g FetchReaderFetcher) FetchReader {
	return FetchReader{
		source:   g,
		data:     nil,
		dataUsed: 0,
	}
}

func (r FetchReader) dataRemain() int {
	return len(r.data) - r.dataUsed
}

// Remain Returns how many bytes is waiting to be readed
func (r *FetchReader) Remain() int {
	return r.dataRemain()
}

// Export directly exports from buffer, never read from source
//
// Params:
//   - n: Exact amount of bytes to fetch (0 to n, n included). If number n is
//        unreachable, an error will be returned, and no internal status will
//        be changed
//
// Returns:
//   - Fetched data
//   - Read error
func (r *FetchReader) Export(n int) ([]byte, error) {
	remain := r.dataRemain()

	if n > remain {
		return nil, ErrFetchReaderNotEnoughBuffer
	}

	newUsed := r.dataUsed + n
	data := r.data[r.dataUsed:newUsed]

	r.dataUsed = newUsed

	return data, nil
}

// Fetch fetchs data from the source
//
// Params:
//   - n: Max bytes to fetch (0 to n, n included)
//
// Returns:
//   - Fetched data
//   - Read error
func (r *FetchReader) Fetch(n int) ([]byte, error) {
	remain := r.dataRemain()

	if remain <= 0 {
		data, dataFetchErr := r.source()

		if dataFetchErr != nil {
			return nil, dataFetchErr
		}

		r.data = data
		r.dataUsed = 0

		remain = r.dataRemain()
	}

	if n > remain {
		n = remain
	}

	newUsed := r.dataUsed + n
	data := r.data[r.dataUsed:newUsed]

	r.dataUsed = newUsed

	return data, nil
}

// Read implements io.Read
func (r *FetchReader) Read(b []byte) (int, error) {
	d, dErr := r.Fetch(len(b))

	if dErr != nil {
		return 0, dErr
	}

	return copy(b, d), nil
}
