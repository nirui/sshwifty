package configuration

func durationAtLeast(current, min int) int {
	if current > min {
		return current
	}

	return min
}
