import os

analog_count = 64
status_count = 128
analog_bytes = 4
status_bytes = (status_count + 15) // 16 * 2

frame_size = 4 + 4 + analog_count * analog_bytes + status_bytes

dat_path = "../uploads/DRL600A_DRec_21538_20121109_061043_818_F.DAT"
size = os.path.getsize(dat_path)

print(f".dat 文件大小: {size} 字节")
print(f"预期每帧大小: {frame_size} 字节")
print(f"帧数应为: {size // frame_size}，是否整除: {size % frame_size == 0}")
