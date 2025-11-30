package configuration

// Sshwifty - A Web SSH client
//
// Copyright (C) 2019-2025 Ni Rui <ranqus@gmail.com>
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

import "math"

type SignedIntegers interface {
	~int | ~int8 | ~int16 | ~int32 | ~int64
}

type UnsignedIntegers interface {
	~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64
}

type Integers interface {
	SignedIntegers | UnsignedIntegers
}

func atMost[I Integers](input I, upperLimit I) I {
	return min(input, upperLimit)
}

func atLeast[I Integers](input I, lowerLimit I) I {
	return max(input, lowerLimit)
}

func clampRange[I Integers](input I, upperLimit I, lowerLimit I) I {
	return atMost(atLeast(input, lowerLimit), upperLimit)
}

func setZeroUintToDefault[I Integers](input I, defaultVal I) I {
	if input <= 0 {
		return defaultVal
	}
	return input
}

func castUintToIntMax[U UnsignedIntegers, S SignedIntegers](input U, max S) S {
	c := S(input)
	if U(c) == input && (input >= 0) == (c >= 0) {
		return c
	}
	return max
}

func castUintToInt[U UnsignedIntegers](input U) int {
	return castUintToIntMax(input, math.MaxInt)
}
