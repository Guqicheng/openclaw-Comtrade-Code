# ===== backend/analysis.py =====
# 信号分析核心模块：RMS计算、峰值检测、FFT谐波分析等工程计算工具

import math

try:
    import numpy
    _HAS_NUMPY = True
except ImportError:
    _HAS_NUMPY = False


def _hann_window(n):
    """汉宁窗：NumPy 1.20+ 有 hann，旧版仅 hanning。"""
    maker = getattr(numpy, "hann", None) or getattr(numpy, "hanning", None)
    if maker is None:
        raise AttributeError("numpy 无 hann/hanning 窗函数，请升级: pip install -U numpy")
    return maker(n)

def calculate_rms(values, time_values=None, cycle_freq=None):
    """
    计算全波 RMS 有效值。
    如果提供 time_values 和 cycle_freq，则按工频周期分段计算。

    参数:
        values: list[float] - 采样值序列
        time_values: list[float] - 对应的时间轴（可选）
        cycle_freq: float - 工频频率，如 50 或 60 Hz（可选）

    返回:
        dict: { "overall": 全局RMS, "perCycle": 每周波RMS列表(可选) }
    """
    if not values or len(values) < 2:
        return {"overall": 0.0, "perCycle": []}

    # 全波 RMS
    sum_sq = sum(v * v for v in values)
    overall_rms = math.sqrt(sum_sq / len(values))

    result = {"overall": round(overall_rms, 6), "perCycle": []}

    # 每周波 RMS
    if time_values is not None and cycle_freq is not None and cycle_freq > 0:
        cycle_period = 1.0 / cycle_freq  # 一个周期的时间长度（秒）
        per_cycle_rms = []

        start_idx = 0
        while start_idx < len(time_values):
            end_time = time_values[start_idx] + cycle_period
            end_idx = start_idx + 1
            while end_idx < len(time_values) and time_values[end_idx] < end_time:
                end_idx += 1

            if end_idx > start_idx:
                window = values[start_idx:end_idx]
                rms_val = math.sqrt(sum(v * v for v in window) / len(window))
                per_cycle_rms.append(round(rms_val, 6))

            start_idx = end_idx

        result["perCycle"] = per_cycle_rms

    return result


def detect_peaks(values, threshold_ratio=0.1):
    """
    检测波形的波峰和波谷位置。

    参数:
        values: list[float] - 采样值序列
        threshold_ratio: float - 峰值检测灵敏度 (0~1)，相对于幅值范围的比例

    返回:
        dict: { "peaks": [(index, value), ...], "valleys": [(index, value), ...] }
    """
    if not values or len(values) < 3:
        return {"peaks": [], "valleys": []}

    # 计算幅值范围
    v_min = min(values)
    v_max = max(values)
    v_range = v_max - v_min
    if v_range == 0:
        return {"peaks": [], "valleys": []}

    threshold = v_range * threshold_ratio

    peaks = []
    valleys = []

    for i in range(1, len(values) - 1):
        # 波峰：高于相邻点且超过阈值
        if values[i] > values[i-1] and values[i] > values[i+1]:
            if values[i] - min(values[i-1], values[i+1]) > threshold:
                peaks.append((i, values[i]))

        # 波谷：低于相邻点且超过阈值
        if values[i] < values[i-1] and values[i] < values[i+1]:
            if max(values[i-1], values[i+1]) - values[i] > threshold:
                valleys.append((i, values[i]))

    return {"peaks": peaks, "valleys": valleys}


def calculate_fft(values, sampling_rate):
    """
    对采样数据执行 FFT，计算频谱和 THD。

    参数:
        values: list[float] - 采样值序列
        sampling_rate: float - 采样率（Hz）

    返回:
        dict
    """
    if not _HAS_NUMPY:
        return {"error": "numpy 未安装，请运行: pip install numpy"}

    if not values or len(values) < 4:
        return {"error": "数据点不足，无法进行FFT分析"}

    n = len(values)

    # 应用汉宁窗减少频谱泄漏
    window = _hann_window(n)
    windowed_data = numpy.array(values, dtype=float) * window

    # FFT
    fft_result = numpy.fft.fft(windowed_data)
    fft_magnitude = numpy.abs(fft_result)[:n // 2] * 2 / n

    # 频率轴
    frequencies = numpy.fft.fftfreq(n, d=1.0/sampling_rate)[:n // 2]

    # 找到基波（忽略直流分量，找幅值最大的频率分量）
    min_freq_for_fundamental = 10  # 最低10Hz以上才认为是基波
    fundamental_idx = None
    fundamental_mag = 0

    for i in range(len(frequencies)):
        if frequencies[i] >= min_freq_for_fundamental and fft_magnitude[i] > fundamental_mag:
            fundamental_mag = fft_magnitude[i]
            fundamental_idx = i

    if fundamental_idx is None or fundamental_mag == 0:
        return {"error": "无法检测到基波频率"}

    fundamental_freq = frequencies[fundamental_idx]

    # 提取各次谐波（1~15次）
    harmonics = []
    for order in range(1, 16):
        target_freq = fundamental_freq * order
        # 在目标频率附近找最近的频率点
        freq_idx = None
        min_diff = float('inf')
        for i in range(len(frequencies)):
            diff = abs(frequencies[i] - target_freq)
            if diff < min_diff:
                min_diff = diff
                freq_idx = i

        if freq_idx is not None and min_diff < fundamental_freq * 0.5:
            mag = fft_magnitude[freq_idx]
            percent = (mag / fundamental_mag) * 100 if order > 1 else 100
            harmonics.append({
                "order": order,
                "freq": round(frequencies[freq_idx], 2),
                "mag": round(float(mag), 6),
                "percent": round(float(percent), 2)
            })

    # THD 计算（总谐波畸变率）
    harmonic_mags_sq = sum(h["mag"] ** 2 for h in harmonics if h["order"] > 1)
    thd = math.sqrt(harmonic_mags_sq) / fundamental_mag * 100 if fundamental_mag > 0 else 0

    # 限制返回的频率范围（最高返回到 2000Hz，对电力系统谐波分析已经足够）
    max_return_freq = 2000
    return_indices = [i for i in range(len(frequencies)) if frequencies[i] <= max_return_freq]
    if not return_indices:
        return_indices = list(range(len(frequencies)))

    return {
        "frequencies": [round(float(frequencies[i]), 4) for i in return_indices],
        "magnitudes": [round(float(fft_magnitude[i]), 6) for i in return_indices],
        "fundamentalFreq": round(float(fundamental_freq), 2),
        "fundamentalMag": round(float(fundamental_mag), 6),
        "thd": round(float(thd), 2),
        "harmonics": harmonics
    }


def calculate_phase_difference(values_a, values_b, sampling_rate, fundamental_freq):
    """
    计算两个模拟通道之间的基波相位差。

    参数:
        values_a: list[float] - 通道A的采样值
        values_b: list[float] - 通道B的采样值
        sampling_rate: float - 采样率
        fundamental_freq: float - 基波频率

    返回:
        dict: { "phaseDiffDeg": 相位差(度) }
    """
    if not _HAS_NUMPY:
        return {"error": "numpy 未安装，请运行: pip install numpy"}
    try:
        n = len(values_a)
        if n < 4 or len(values_b) < 4:
            return {"error": "数据点不足"}

        # 对两个通道做 FFT 提取基波相位
        window = _hann_window(n)
        a_windowed = numpy.array(values_a, dtype=float) * window
        b_windowed = numpy.array(values_b, dtype=float) * window

        a_fft = numpy.fft.fft(a_windowed)
        b_fft = numpy.fft.fft(b_windowed)

        # 找到基波对应的 bin
        bin_idx = int(round(fundamental_freq * n / sampling_rate))
        if bin_idx >= n // 2:
            return {"error": "基波频率超出分析范围"}

        # 提取相位
        phase_a = math.atan2(a_fft[bin_idx].imag, a_fft[bin_idx].real)
        phase_b = math.atan2(b_fft[bin_idx].imag, b_fft[bin_idx].real)

        phase_diff = phase_a - phase_b
        # 归一化到 -180 ~ 180 度
        phase_diff_deg = math.degrees(phase_diff)
        phase_diff_deg = (phase_diff_deg + 180) % 360 - 180

        return {
            "phaseDiffDeg": round(phase_diff_deg, 2),
            "channelA": {"phaseDeg": round(math.degrees(phase_a), 2)},
            "channelB": {"phaseDeg": round(math.degrees(phase_b), 2)}
        }

    except Exception as e:
        return {"error": str(e)}
