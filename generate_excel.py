#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to generate genealogy_template.xlsx based on real genealogy data from
'Họ Trần Ngọc - Ngành II Công Giáo' and standard genealogy requirements.
"""

import os
import sys
import zipfile
import xml.sax.saxutils as saxutils

RAW_DATA = """Mã ID,Tên Thánh,Họ và Tên,Thế Hệ (Đời),Chi / Ngành,Mã ID Cha/Mẹ,Tên Cha/Mẹ,Vợ / Chồng / Phối Ngẫu,Ngày/Năm Sinh,Ngày/Năm Mất,Ghi Chú Chi Tiết & Con Cháu
P001,,Trần Ngọc Truyền,1,Ngành II,-,Thủy Tổ,,,,Cố Trần Ngọc Truyền - Khởi đầu Ngành II Công Giáo
P002,,Trần Ngọc Toại,2,Ngành II,P001,Trần Ngọc Truyền,,,,Con nối dõi Cố Trần Ngọc Truyền
P003,,Trần Ngọc Thanh,3,Ngành II,P002,Trần Ngọc Toại,Bà cả; Bà hai,,,Thượng Chi (Chi 1) - Có 2 đời vợ
P004,,Trần Ngọc Phúc,3,Ngành II,P002,Trần Ngọc Toại,(Có vợ),,,Hạ Chi (Chi 2)
P005,,Trần Ngọc Tân,4,Chi 1,P003,Trần Ngọc Thanh,,,,Trưởng Chi 1 - Đời 4 (Có 6 người con)
P006,Giuse,Trần Ngọc Xuân,4,Chi 1,P003,Trần Ngọc Thanh,Anna Đoàn Thị Loan,,Đã chết,Thầy/Thoại - Đã chết (Trang 9)
P007,,Trần Ngọc Lịch,4,Chi 1,P003,Trần Ngọc Thanh,,,Đã chết,Con cụ Thanh (Trang 13)
P008,,Trần Ngọc Quáp,4,Chi 2,P004,Trần Ngọc Phúc,Vũ Thị Tới,,,Con cụ Phúc (Trang 19)
P009,,Trần Ngọc Thước,4,Chi 2,P004,Trần Ngọc Phúc,,,,Con cụ Phúc (Trang 25)
P010,,Trần Ngọc Chán (Thủ),4,Chi 2,P004,Trần Ngọc Phúc,,,,Con cụ Phúc (Trang 31)
P011,,Trần Thị Dịch,4,Chi 2,P004,Trần Ngọc Phúc,Nguyễn Văn Địch,,,Con gái cụ Phúc (Trang 32)
P012,,Trần Thị ... (Con thứ 1),5,Chi 1,P005,Trần Ngọc Tân,Trần Hữu Đồn,,,Con gái thứ 1 cụ Tân (Trang 2)
P013,,Trần Thị ... (Con thứ 2),5,Chi 1,P005,Trần Ngọc Tân,Trần Ngọc Thân,,,Con gái thứ 2 cụ Tân (Trang 2)
P014,Ma Rea (Maria),Trần Ngọc Ngo,5,Chi 1,P005,Trần Ngọc Tân,Trần Thị Thiều,,Mất 21/3; Vợ mất 21/10,Con thứ 3 cụ Tân (Trang 3)
P015,,Trần Ngọc Mùi,5,Chi 1,P005,Trần Ngọc Tân,Bà cả: Trần Thị ...; Bà hai: Vũ Thị Cờn,,Đã mất,Con thứ 4 cụ Tân (Trang 3, 4)
P016,,Trần Ngọc Tý,5,Chi 1,P005,Trần Ngọc Tân,Maria Đoàn Thị Dụ,,,Con thứ 5 cụ Tân
P017,,Trần Thị Cam,5,Chi 1,P005,Trần Ngọc Tân,-,,Mất 12 - 3,Con thứ 6 cụ Tân (Chết nhỏ)
P012_1,,Trần Hữu Vợi,6,Chi 1,P012,Trần Thị ... (Con 1 cụ Tân),Trần Thị ...,,,Con ông Trần Hữu Đồn & Cụ Trần Thị ... (Cháu ngoại)
P012_2,,Trần Hữu Bảo,6,Chi 1,P012,Trần Thị ... (Con 1 cụ Tân),Trần Thị ...,,,Con ông Trần Hữu Đồn & Cụ Trần Thị ... (Cháu ngoại)
P012_3,,Trần Thị ...,6,Chi 1,P012,Trần Thị ... (Con 1 cụ Tân),Phạm Quang Quyến,,,Con gái ông Trần Hữu Đồn (Cháu ngoại)
P012_4,,Trần Thị ...,6,Chi 1,P012,Trần Thị ... (Con 1 cụ Tân),Phạm Quang Trình,,,Con gái ông Trần Hữu Đồn (Cháu ngoại)
P013_1,,Trần Thị ...,6,Chi 1,P013,Trần Thị ... (Con 2 cụ Tân),Trần Xuân Thơ,,,Con gái ông Trần Ngọc Thân & Cụ Trần Thị ... (Cháu ngoại)
P013_2,,Trần Thị Chiện,6,Chi 1,P013,Trần Thị ... (Con 2 cụ Tân),,,,Con gái ông Trần Ngọc Thân & Cụ Trần Thị ... (Cháu ngoại)
P018,,Trần Thị Én,6,Chi 1,P014,Trần Ngọc Ngo,Trần Văn Thủ,,,Có 7 con (2 gái, 5 trai). Lập tự: Trần Ngọc Vị
P019,,Trần Thị Ngói,6,Chi 1,P014,Trần Ngọc Ngo,Nguyễn Văn Tình,,,Có 5 con (2 trai, 3 gái). Lập tục: Trần Ngọc Đức
P020,Maria,Trần Thị Lê,6,Chi 1,P014,Trần Ngọc Ngo,Phanxico Vũ Đình Án,,,Có 4 con (3 trai, 1 gái)
P021,,Trần Thị Thạch,6,Chi 1,P014,Trần Ngọc Ngo,Phạm Quang Viết,,,Có 7 con (4 trai, 3 gái)
P022,,Trần Ngọc Giai,6,Chi 1,P015,Trần Ngọc Mùi,-,,Chết sớm 20/4,Con cụ Mùi
P023,Phanxico,Trần Ngọc Vị,6,Chi 1,P015,Trần Ngọc Mùi,Têrêxa Vũ Thị Suý,SN 1928,Mất 15/08/1998 Âm,8 con (4 trai, 4 gái), 15 cháu nội, 4 cháu ngoại (Trang 4)
P024,,Trần Ngọc Thể,6,Chi 1,P015,Trần Ngọc Mùi,-,,Chết sớm,Con cụ Mùi
P025,Phanxico,Trần Ngọc Đức,6,Chi 1,P015,Trần Ngọc Mùi,Anna Nguyễn Thị Vy,SN 1935,Mất 04/09/1993 Âm,8 con (3 trai, 5 gái), 6 cháu nội, 7 cháu ngoại (Trang 7)
P026,Phanxico,Trần Ngọc Bi,7,Chi 1,P023,Trần Ngọc Vị,Maria Trần Thị Thục (SN 1955),23/04/1954,Mất 19/12/2004,Có 5 con (4 gái, 1 trai)
P027,Têrêxa,Trần Thị Chuột,7,Chi 1,P023,Trần Ngọc Vị,-,SN 1956,Ốm chết từ nhỏ,Con gái cụ Vị
P028,Phanxico,Trần Ngọc Thoàn,7,Chi 1,P023,Trần Ngọc Vị,Anna Trần Thị Lan (SN 1965),SN 1958,,Có 4 con (2 trai, 2 gái) (Trang 5)
P029,Têrêxa,Trần Thị Thúy,7,Chi 1,P023,Trần Ngọc Vị,Trần Hữu Đài,02/08/1960,,Có 4 con (2 trai, 2 gái) (Cháu ngoại cụ Vị)
P030,Phanxico,Trần Ngọc Thạnh,7,Chi 1,P023,Trần Ngọc Vị,Têrêxa Ngô Thị Bình (SN 1970),20/11/1962,,Có 3 con (2 trai, 1 gái) (Trang 6)
P031,Têrêxa,Trần Thị Thơi,7,Chi 1,P023,Trần Ngọc Vị,-,13/01/1965,Ốm chết từ nhỏ,Con gái cụ Vị
P032,Anna,Trần Thị Hồng,7,Chi 1,P023,Trần Ngọc Vị,,SN 1969,,Con gái cụ Vị
P033,Phanxico,Trần Ngọc Hào,7,Chi 1,P023,Trần Ngọc Vị,Nguyễn Thị Dung (SN 1979),06/07/1972,,Có 2 con (1 trai, 1 gái)
P029_1,,Trần Hữu Đoan,8,Chi 1,P029,Trần Thị Thúy,,,,Con ông Trần Hữu Đài & Bà Trần Thị Thúy (Cháu ngoại)
P029_2,,Trần Hữu Điệp,8,Chi 1,P029,Trần Thị Thúy,,,,Con ông Trần Hữu Đài & Bà Trần Thị Thúy (Cháu ngoại)
P029_3,,Trần Thị Chung,8,Chi 1,P029,Trần Thị Thúy,,,,Con gái ông Trần Hữu Đài (Cháu ngoại)
P029_4,,Trần Thị Chiều,8,Chi 1,P029,Trần Thị Thúy,,,,Con gái ông Trần Hữu Đài (Cháu ngoại)
P034,Vivian,Trần Thị Thuận,8,Chi 1,P026,Trần Ngọc Bi,,29/09/1981,,Con ông Bi
P035,Anna,Trần Thị Thảo,8,Chi 1,P026,Trần Ngọc Bi,,,,Con ông Bi
P036,Anna,Trần Thị Thêu,8,Chi 1,P026,Trần Ngọc Bi,,06/10/1989,,Con ông Bi
P037,Anna,Trần Thị Thoa,8,Chi 1,P026,Trần Ngọc Bi,,,,Con ông Bi
P038,Phanxico,Trần Ngọc Bắc,8,Chi 1,P026,Trần Ngọc Bi,,13/06/1992,,ĐÍCH TÔN dòng họ (Trang 4)
P039,Maria,Trần Thị Thao,8,Chi 1,P028,Trần Ngọc Thoàn,,28/04/1986,,Con ông Thoàn
P040,Maria,Trần Thị Thế,8,Chi 1,P028,Trần Ngọc Thoàn,,01/03/1988,,Con ông Thoàn
P041,Phanxico,Trần Ngọc Hùng,8,Chi 1,P028,Trần Ngọc Thoàn,,06/07/1992,,Con ông Thoàn
P042,Phanxico,Trần Ngọc Hải,8,Chi 1,P028,Trần Ngọc Thoàn,,10/08/1995,,Con ông Thoàn
P043,Anna,Trần Thị Ngọc,8,Chi 1,P030,Trần Ngọc Thạnh,,10/11/1991,,Con ông Thạnh
P044,Phanxico,Trần Ngọc Thái,8,Chi 1,P030,Trần Ngọc Thạnh,,06/07/1993,,Con ông Thạnh
P045,Phanxico,Trần Ngọc Huân,8,Chi 1,P030,Trần Ngọc Thạnh,,27/07/1997,,Con ông Thạnh
P046,Phanxico,Trần Ngọc Hân,8,Chi 1,P033,Trần Ngọc Hào,,03/10/2001,,Con ông Hào
P047,Anna,Trần Thị Dương,8,Chi 1,P033,Trần Ngọc Hào,,28/06/2003,,Con ông Hào
P048,,Trần Thị Về,7,Chi 1,P025,Trần Ngọc Đức,-,,Ốm chết từ nhỏ,Con gái cụ Đức
P049,,Trần Thị Mị,7,Chi 1,P025,Trần Ngọc Đức,-,,Ốm chết từ nhỏ,Con gái cụ Đức
P050,Gioan,Trần Ngọc Đạo,7,Chi 1,P025,Trần Ngọc Đức,Anna Trần Thị Lục (SN 1961),30/11/1959,,Có 1 trai, 1 gái
P051,Têrêxa,Trần Thị Chuyên,7,Chi 1,P025,Trần Ngọc Đức,Phanxico Vũ Đình Điểm (SN 1958),SN 1962,,Có 1 trai, 1 gái (Cháu ngoại cụ Đức)
P052,Phanxico,Trần Ngọc Hạm,7,Chi 1,P025,Trần Ngọc Đức,Anna Trần Thị Khuyên (SN 1969),SN 1966,,Có 1 trai, 1 gái
P053,Phanxico,Trần Ngọc Hành,7,Chi 1,P025,Trần Ngọc Đức,Anna Nguyễn Thị Ngát (SN 1966),SN 1967,,Có 2 con trai
P054,Anna,Trần Thị Hoa,7,Chi 1,P025,Trần Ngọc Đức,Nguyễn Văn Kỳ,,,Có 1 trai, 1 gái (Cháu ngoại cụ Đức)
P055,,Trần Thị Quế,7,Chi 1,P025,Trần Ngọc Đức,Trần Hữu Vinh (SN 1971),SN 1973,,Có 2 trai, 1 gái (Cháu ngoại cụ Đức)
P051_1,Anna,Vũ Thị Huyền,8,Chi 1,P051,Trần Thị Chuyên,,SN 1983,,Con gái ông Vũ Đình Điểm & Bà Trần Thị Chuyên
P051_2,Anna,Vũ Thị Sâm,8,Chi 1,P051,Trần Thị Chuyên,,SN 1986,,Con gái ông Vũ Đình Điểm & Bà Trần Thị Chuyên
P054_1,,Nguyễn Văn Phượng,8,Chi 1,P054,Trần Thị Hoa,,,,Con ông Nguyễn Văn Kỳ & Bà Trần Thị Hoa
P054_2,,Nguyễn Thị Huệ,8,Chi 1,P054,Trần Thị Hoa,,,,Con gái ông Nguyễn Văn Kỳ & Bà Trần Thị Hoa
P055_1,Phanxico,Trần Hữu Quy,8,Chi 1,P055,Trần Thị Quế,,SN 1992,,Con ông Trần Hữu Vinh & Bà Trần Thị Quế
P055_2,Phanxico,Trần Hữu Huy,8,Chi 1,P055,Trần Thị Quế,,SN 1994,,Con ông Trần Hữu Vinh & Bà Trần Thị Quế
P055_3,Anna,Trần Thị Huế,8,Chi 1,P055,Trần Thị Quế,,SN 2003,,Con gái ông Trần Hữu Vinh & Bà Trần Thị Quế
P056,Phanxico,Trần Ngọc Long,8,Chi 1,P050,Trần Ngọc Đạo,,SN 1982,,ĐÍCH TÔN nhánh cụ Đức
P057,Maria,Trần Thị Ly,8,Chi 1,P050,Trần Ngọc Đạo,,SN 1985,,Con ông Đạo
P058,Giuse,Trần Ngọc Quân,8,Chi 1,P053,Trần Ngọc Hành,,SN 1989,,Con ông Hành
P059,Phanxico,Trần Ngọc Quảng,8,Chi 1,P053,Trần Ngọc Hành,,SN 1999,,Con ông Hành
P060,Phanxico,Trần Ngọc Thi,5,Chi 1,P006,Trần Ngọc Xuân,-,,Đã chết,Đi nhà thầy đã chết
P061,Anna,Trần Thị Nhâm,5,Chi 1,P006,Trần Ngọc Xuân,Mai Văn San,,Đã chết,Có 8 con họ Mai (Trang 10, 11)
P062,Phanxico,Trần Ngọc Mô,5,Chi 1,P006,Trần Ngọc Xuân,Anna Phạm Thị Suý,,Vợ mất 01/12/1962,Có 6 con (2 trai, 4 gái) (Trang 11, 12)
P061_1,,Mai Văn Quỳnh,6,Chi 1,P061,Trần Thị Nhâm,Quyết,,,Con ông Mai Văn San & Cụ Trần Thị Nhâm (Có 10 con)
P061_2,,Mai Thị Ánh,6,Chi 1,P061,Trần Thị Nhâm,Vũ Đình Thìn,,,Con gái ông Mai Văn San (Có 11 con)
P061_3,,Mai Văn Hô,6,Chi 1,P061,Trần Thị Nhâm,Nguyễn Thị Lựu,,,Con ông Mai Văn San (Có 8 con)
P061_4,,Mai Văn Phách,6,Chi 1,P061,Trần Thị Nhâm,Trần Thị Nhâm,,,Con ông Mai Văn San (Có 4 con)
P061_5,,Mai Thị Sáng,6,Chi 1,P061,Trần Thị Nhâm,Vũ Văn Luyện,,,Con gái ông Mai Văn San (Có 10 con)
P061_6,,Mai Thị Loan,6,Chi 1,P061,Trần Thị Nhâm,-,,Chết sớm,Con gái ông Mai Văn San
P061_7,,Mai Văn Dương,6,Chi 1,P061,Trần Thị Nhâm,Nguyễn Thị Tám,,,Con ông Mai Văn San (Có 5 con)
P063,,Trần Thị Tình,6,Chi 1,P062,Trần Ngọc Mô,Trần Hữu Quyết,,,Có 8 con (3 trai, 5 gái)
P064,,Trần Thị Tự,6,Chi 1,P062,Trần Ngọc Mô,Trần Hữu Sinh,,,Có 8 con (4 trai, 4 gái)
P065,,Trần Thị Tam,6,Chi 1,P062,Trần Ngọc Mô,-,,Đã chết,Con cụ Mô
P066,,Trần Thị Tứ,6,Chi 1,P062,Trần Ngọc Mô,,,,Có 4 con (2 trai, 2 gái)
P067,Phanxico,Trần Ngọc Ngữ,6,Chi 1,P062,Trần Ngọc Mô,-,,Đã chết,Con cụ Mô
P068,Phanxico,Trần Ngọc Thuyết,6,Chi 1,P062,Trần Ngọc Mô,Maria Đinh Thị Mùi (SN 1950),12/11/1949,,Có 4 con (2 trai, 2 gái) (Trang 12)
P069,Anna,Trần Thị Tuyến,7,Chi 1,P068,Trần Ngọc Thuyết,Phaolo Vũ Đình Khải (ốm chết),20/12/1975,,Có 1 trai, 1 gái (Cháu ngoại cụ Thuyết)
P070,Phanxico,Trần Ngọc Tuyền,7,Chi 1,P068,Trần Ngọc Thuyết,Anna Nguyễn Thị Linh (SN 1980),01/10/1977,,Có 3 con (Trang 12)
P071,Anna,Trần Thị Tuyết,7,Chi 1,P068,Trần Ngọc Thuyết,,08/04/1981,,Con ông Thuyết
P072,Giuse,Trần Ngọc Dung,7,Chi 1,P068,Trần Ngọc Thuyết,-,15/01/1985,Mất 04/10/2004 Âm,Con ông Thuyết
P069_1,,Vũ Thị Mị,8,Chi 1,P069,Trần Thị Tuyến,,,,Con gái ông Vũ Đình Khải & Bà Trần Thị Tuyến
P069_2,,Vũ Đình Hoạt,8,Chi 1,P069,Trần Thị Tuyến,,,,Con ông Vũ Đình Khải & Bà Trần Thị Tuyến
P073,,Trần Thị Hương,8,Chi 1,P070,Trần Ngọc Tuyền,,19/09/1999,,Con ông Tuyền
P074,,Trần Thị Thúy,8,Chi 1,P070,Trần Ngọc Tuyền,,09/11/2001,,Con ông Tuyền
P075,,Trần Ngọc Minh,8,Chi 1,P070,Trần Ngọc Tuyền,,30/09/2004,,ĐÍCH TÔN nhánh cụ Thuyết
P076,,Trần Ngọc Nguyên,5,Chi 1,P007,Trần Ngọc Lịch,Anna Trần Thị Đại,,Vợ mất 17/03/1970,Con cụ Lịch (Trang 13)
P077,,Trần Thị Lân,5,Chi 1,P007,Trần Ngọc Lịch,Ngô Văn Phong,,,Có 6 con họ Ngô (Trang 14)
P078,Phanxico,Trần Ngọc Căn,5,Chi 1,P007,Trần Ngọc Lịch,Hoàng Thị Thao,,Mất 26/06/1973,Có 8 con (2 trai, 6 gái) (Trang 15 - 18)
P079,,Trần Ngọc Khiết,5,Chi 1,P007,Trần Ngọc Lịch,-,,Mất sớm,Con cụ Lịch
P077_1,,Ngô Văn Hòa,6,Chi 1,P077,Trần Thị Lân,Trần Thị ...,,,Con ông Ngô Văn Phong & Cụ Trần Thị Lân (Có 6 con)
P077_2,,Ngô Thị Tính,6,Chi 1,P077,Trần Thị Lân,Đức Hoàng,,,Con gái ông Ngô Văn Phong (Có 6 con)
P077_3,,Ngô Văn Khiêu,6,Chi 1,P077,Trần Thị Lân,Trần Thị Cảnh,,,Con ông Ngô Văn Phong (Có 5 con)
P077_4,,Ngô Văn Khích,6,Chi 1,P077,Trần Thị Lân,-,,Ốm chết,Con ông Ngô Văn Phong
P077_5,,Ngô Thị Tách,6,Chi 1,P077,Trần Thị Lân,Tịch,,,Con gái ông Ngô Văn Phong (Có 5 con gái)
P077_6,,Ngô Văn Thích,6,Chi 1,P077,Trần Thị Lân,Vũ Thị Lan,,,Con ông Ngô Văn Phong (Có 2 con)
P080,,Trần Thị Diệp,6,Chi 1,P078,Trần Ngọc Căn,,SN 1947,,Con cụ Căn
P081,,Trần Ngọc Thiệp,6,Chi 1,P078,Trần Ngọc Căn,-,SN 1948,Chết sớm,Con cụ Căn
P082,,Trần Thị Cai,6,Chi 1,P078,Trần Ngọc Căn,Phạm Văn Hưng,SN 1950,,Có 3 con (1 trai, 2 gái)
P083,,Trần Thị Ly,6,Chi 1,P078,Trần Ngọc Căn,Trần Văn Bảo,,,Có 5 con (2 trai, 3 gái)
P084,,Trần Thị Bi,6,Chi 1,P078,Trần Ngọc Căn,Mai Văn Thuấn,,,Có 3 con (2 trai, 1 gái)
P085,,Trần Ngọc Bản,6,Chi 1,P078,Trần Ngọc Căn,Nguyễn Thị Tươi,,,Có 2 con (1 trai, 1 gái) (Trang 18)
P086,,Trần Thị Phảng,6,Chi 1,P078,Trần Ngọc Căn,Ngô Văn Xuyến,,,Có 2 con họ Ngô (Cháu ngoại cụ Căn)
P087,,Trần Thị Tuy,6,Chi 1,P078,Trần Ngọc Căn,Mai Văn Cẩm,,,Có 6 con họ Mai (Cháu ngoại cụ Căn)
P086_1,,Ngô Văn Luyến,7,Chi 1,P086,Trần Thị Phảng,,,,Con ông Ngô Văn Xuyến & Bà Trần Thị Phảng
P086_2,,Ngô Thị Nga,7,Chi 1,P086,Trần Thị Phảng,,,,Con gái ông Ngô Văn Xuyến & Bà Trần Thị Phảng
P088,,Trần Ngọc Khoa,7,Chi 1,P085,Trần Ngọc Bản,,,,ĐÍCH TÔN nhánh cụ Căn
P089,,Trần Thị Diệu,7,Chi 1,P085,Trần Ngọc Bản,,,,Con ông Bản
P090,,Trần Ngọc Đoán,5,Chi 2,P008,Trần Ngọc Quáp,Mai Thị Xứng (Mất 1975),,Mất 1943,Con cụ Quáp (Trang 19)
P091,,Trần Ngọc Cầu,5,Chi 2,P008,Trần Ngọc Quáp,-,,Chết sớm,Con cụ Quáp
P092,,Trần Ngọc Dân,5,Chi 2,P008,Trần Ngọc Quáp,-,,Chết sớm,Con cụ Quáp
P093,,Trần Thị Đào,6,Chi 2,P090,Trần Ngọc Đoán,Phạm Quang Viêm (đã chết),,,Có 8 con họ Phạm (Trang 20)
P094,,Trần Ngọc Đông,6,Chi 2,P090,Trần Ngọc Đoán,Bà cả: Đinh Thị Thảo (mất 1953); Bà hai: Đỗ Thị Hương (SN 1941),08/05/1930,,Có 10 con (7 trai, 3 gái) (Trang 21 - 23)
P095,,Trần Thị Lý Sính,6,Chi 2,P090,Trần Ngọc Đoán,Đỗ Duy Tý,,,Có 11 con họ Đỗ (Trang 24)
P093_1,,Phạm Quang Đăng,7,Chi 2,P093,Trần Thị Đào,,,,Con ông Phạm Quang Viêm & Bà Trần Thị Đào
P093_2,,Phạm Quang Thán,7,Chi 2,P093,Trần Thị Đào,,,,Con ông Phạm Quang Viêm & Bà Trần Thị Đào
P093_3,,Phạm Quang Pháo,7,Chi 2,P093,Trần Thị Đào,,,,Con ông Phạm Quang Viêm & Bà Trần Thị Đào
P093_4,,Phạm Thị Thẹn,7,Chi 2,P093,Trần Thị Đào,,,,Con gái ông Phạm Quang Viêm
P093_5,,Phạm Thị Thể,7,Chi 2,P093,Trần Thị Đào,,,,Con gái ông Phạm Quang Viêm
P093_6,,Phạm Thị Thị,7,Chi 2,P093,Trần Thị Đào,,,,Con gái ông Phạm Quang Viêm
P093_7,,Phạm Thị Bình,7,Chi 2,P093,Trần Thị Đào,,,,Con gái ông Phạm Quang Viêm
P093_8,,Phạm Thị Bính,7,Chi 2,P093,Trần Thị Đào,,,,Con gái ông Phạm Quang Viêm
P095_1,,Đỗ Duy Lan,7,Chi 2,P095,Trần Thị Lý Sính,,,,Tu sỹ - Con ông Đỗ Duy Tý & Bà Trần Thị Lý Sính
P095_2,,Đỗ Thị Hải,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con gái ông Đỗ Duy Tý (Có 3 con)
P095_3,,Đỗ Duy Thành,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con ông Đỗ Duy Tý (Có 8 con)
P095_4,,Đỗ Minh Tuấn,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con ông Đỗ Duy Tý
P095_5,,Đỗ Duy Sơn,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con ông Đỗ Duy Tý (Có 2 con)
P095_6,,Đỗ Duy Sử,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con ông Đỗ Duy Tý (Có 2 con)
P095_7,,Đỗ Duy Dũng,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con ông Đỗ Duy Tý
P095_8,,Đỗ Thị Nguyệt,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con gái ông Đỗ Duy Tý
P095_9,,Đỗ Thị Hồng,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con gái ông Đỗ Duy Tý (Có 1 con)
P095_10,,Đỗ Thị Tiến,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con gái ông Đỗ Duy Tý
P095_11,,Đỗ Thị Ngát,7,Chi 2,P095,Trần Thị Lý Sính,,,,Con gái ông Đỗ Duy Tý (Có 3 con)
P096,,Trần Thị Châu,7,Chi 2,P094,Trần Ngọc Đông,Vũ Hữu Quang,SN 1950,,Con bà cả Đinh Thị Thảo (Có 5 con họ Vũ)
P097,,Trần Ngọc Đồng (Hòa),7,Chi 2,P094,Trần Ngọc Đông,Bùi Thị Hương,SN 1961,,Con bà hai Đỗ Thị Hương
P098,,Trần Thị Ngọc Chiêu,7,Chi 2,P094,Trần Ngọc Đông,Nguyễn Văn Liệu,17/05/1963,,Có 2 con (Cháu ngoại cụ Đông)
P099,,Trần Thị Chi,7,Chi 2,P094,Trần Ngọc Đông,Vũ Duy Quyền,SN 1965,,Có 2 con họ Vũ (Cháu ngoại cụ Đông)
P100,,Trần Ngọc Điển,7,Chi 2,P094,Trần Ngọc Đông,Nguyễn Thị Ánh Trang,SN 1966,,Có 3 con (2 trai, 1 gái)
P101,,Trần Ngọc Hùng,7,Chi 2,P094,Trần Ngọc Đông,Nguyễn Thị Thu Hà,SN 1970,,Con ông Đông
P102,,Trần Ngọc Dũng,7,Chi 2,P094,Trần Ngọc Đông,,13/02/1972,,Con ông Đông
P103,,Trần Ngọc Cường,7,Chi 2,P094,Trần Ngọc Đông,,02/12/1973,,Con ông Đông
P104,,Trần Ngọc Hồng Phước,7,Chi 2,P094,Trần Ngọc Đông,,02/09/1980,,Con ông Đông
P105,,Trần Xuân Lộc,7,Chi 2,P094,Trần Ngọc Đông,,12/06/1985,,Con ông Đông
P096_1,,Vũ Thị Vân,8,Chi 2,P096,Trần Thị Châu,,SN 1950,,Con gái ông Vũ Hữu Quang & Bà Trần Thị Châu
P096_2,,Vũ Trần Long,8,Chi 2,P096,Trần Thị Châu,,,,Con ông Vũ Hữu Quang & Bà Trần Thị Châu
P096_3,,Vũ Trần Vũ,8,Chi 2,P096,Trần Thị Châu,,,,Con ông Vũ Hữu Quang & Bà Trần Thị Châu
P096_4,,Vũ Trần Giang,8,Chi 2,P096,Trần Thị Châu,,,,Con ông Vũ Hữu Quang & Bà Trần Thị Châu
P096_5,,Vũ Trần Kế,8,Chi 2,P096,Trần Thị Châu,,,,Con ông Vũ Hữu Quang & Bà Trần Thị Châu
P098_1,,Nguyễn Thị Oanh Kiều,8,Chi 2,P098,Trần Thị Ngọc Chiêu,,,,Con gái ông Nguyễn Văn Liệu & Bà Trần Thị Ngọc Chiêu
P098_2,,Nguyễn Trần Văn Phú,8,Chi 2,P098,Trần Thị Ngọc Chiêu,,,,Con ông Nguyễn Văn Liệu & Bà Trần Thị Ngọc Chiêu
P099_1,,Vũ Trần Kiên,8,Chi 2,P099,Trần Thị Chi,,,,Con ông Vũ Duy Quyền & Bà Trần Thị Chi
P099_2,,Vũ Trần Di Tâm,8,Chi 2,P099,Trần Thị Chi,,,,Con ông Vũ Duy Quyền & Bà Trần Thị Chi
P106,,Trần Thị Huyền,8,Chi 2,P097,Trần Ngọc Đồng,,,,Con ông Đồng
P107,,Trần Ngọc Huy,8,Chi 2,P100,Trần Ngọc Điển,,,,Con ông Điển
P108,,Trần Ngọc Hoàng,8,Chi 2,P100,Trần Ngọc Điển,,,,Con ông Điển
P109,,Trần Thị Anh Ngọc,8,Chi 2,P100,Trần Ngọc Điển,,,,Con ông Điển
P110,,Trần Thị ...,5,Chi 2,P009,Trần Ngọc Thước,Phạm Văn Nga,,Đã mất,Có 5 con họ Phạm (Trang 25)
P111,Phanxico,Trần Ngọc Hoàng,5,Chi 2,P009,Trần Ngọc Thước,,,Đã mất,Có 7 con (2 trai, 5 gái) (Trang 26)
P112,,Trần Thị ...,5,Chi 2,P009,Trần Ngọc Thước,Trần Văn Tẹo,,Đã mất,Có 5 con (Trang 29)
P113,,Trần Thị Rím,5,Chi 2,P009,Trần Ngọc Thước,Nguyễn Văn Cản,,Đã mất,Có 5 con họ Nguyễn (Trang 30)
P114,Phanxico,Trần Ngọc Đềnh,5,Chi 2,P009,Trần Ngọc Thước,,,Đã mất,Có 2 con (Trang 30)
P110_1,,Phạm Văn Điệt,6,Chi 2,P110,Trần Thị ...,,,,Con ông Phạm Văn Nga & Cụ Trần Thị ... (Có 3 con)
P110_2,,Phạm Thị ...,6,Chi 2,P110,Trần Thị ...,Am,,,Con gái ông Phạm Văn Nga (Có 4 con)
P110_3,,Phạm Văn Hảo,6,Chi 2,P110,Trần Thị ...,,,,Con ông Phạm Văn Nga
P110_4,,Phạm Văn Nhân,6,Chi 2,P110,Trần Thị ...,,,,Con ông Phạm Văn Nga
P110_5,,Phạm Văn Diệu,6,Chi 2,P110,Trần Thị ...,,,,Con ông Phạm Văn Nga
P112_1,,Trần Thị ...,6,Chi 2,P112,Trần Thị ...,Vũ Đình Mỹ,,,Con gái ông Trần Văn Tẹo (Có 6 con)
P112_2,,Trần Thị ...,6,Chi 2,P112,Trần Thị ...,Nguyễn Văn Lợi,,,Con gái ông Trần Văn Tẹo (Có 7 con)
P112_3,,Trần Thị ...,6,Chi 2,P112,Trần Thị ...,Phạm Văn Lâm,,,Con gái ông Trần Văn Tẹo (Có 8 con)
P134,,Trần Văn Ước,6,Chi 2,P112,Trần Thị ...,Trần Thị Duyên,,,Có 7 con (4 trai, 3 gái) (Trang 29)
P135,,Trần Thị Tình,6,Chi 2,P112,Trần Thị ...,Vũ Đình Dụ,,,Con gái ông Trần Văn Tẹo
P113_1,,Nguyễn Văn Châu,6,Chi 2,P113,Trần Thị Rím,Trần Thị Phượng,,,Con ông Nguyễn Văn Cản & Cụ Trần Thị Rím (Có 5 con)
P113_2,,Nguyễn Văn Thiện,6,Chi 2,P113,Trần Thị Rím,Phan Thị Vui,,,Con ông Nguyễn Văn Cản & Cụ Trần Thị Rím (Có 4 con)
P113_3,,Nguyễn Thị Nhị,6,Chi 2,P113,Trần Thị Rím,Trần Văn Tá,,,Con gái ông Nguyễn Văn Cản (Có 5 con)
P113_4,,Trần Thị Cài,6,Chi 2,P113,Trần Thị Rím,Ngô Văn Hổ,,,Con gái ông Nguyễn Văn Cản
P113_5,,Trần Thị Sợi,6,Chi 2,P113,Trần Thị Rím,Vũ Đình Dân,,,Con gái ông Nguyễn Văn Cản
P115,Phanxico,Trần Ngọc Thư,6,Chi 2,P111,Trần Ngọc Hoàng,,,,Có 8 con (3 trai, 5 gái) (Trang 27)
P116,,Trần Thị Hiệu,6,Chi 2,P111,Trần Ngọc Hoàng,Nguyễn Văn Chấm,,,Có 4 con (2 trai, 2 gái)
P117,,Trần Thị Han,6,Chi 2,P111,Trần Ngọc Hoàng,,,,Con cụ Hoàng
P118,,Trần Thị Ngọt,6,Chi 2,P111,Trần Ngọc Hoàng,Trần Văn Kiểm,,,Có 2 con
P119,,Trần Thị Mãng,6,Chi 2,P111,Trần Ngọc Hoàng,Đoàn Văn Quản,,,Con cụ Hoàng
P120,,Trần Thị Minh (Mọc),6,Chi 2,P111,Trần Ngọc Hoàng,,,,Con cụ Hoàng
P121,Phanxico,Trần Ngọc Chung,6,Chi 2,P111,Trần Ngọc Hoàng,-,,Chết sớm,Con cụ Hoàng
P122,,Trần Ngọc Thìu,7,Chi 2,P115,Trần Ngọc Thư,Phạm Thị Phương,,,Có 3 con (Trang 27)
P123,,Trần Thị Nẻ,7,Chi 2,P115,Trần Ngọc Thư,-,,Chết sớm,Con ông Thư
P124,Phanxico,Trần Ngọc Thụy,7,Chi 2,P115,Trần Ngọc Thư,-,,Chết sớm,Con ông Thư
P125,,Trần Thị Thuý,7,Chi 2,P115,Trần Ngọc Thư,,,,Con ông Thư
P126,,Trần Thị Lam,7,Chi 2,P115,Trần Ngọc Thư,Trần Văn Tuấn,,,Con ông Thư
P127,,Trần Thị Miến,7,Chi 2,P115,Trần Ngọc Thư,-,,Chết sớm,Con ông Thư
P128,,Trần Thị Miền,7,Chi 2,P115,Trần Ngọc Thư,,,,Con ông Thư
P129,,Trần Ngọc Bắc,7,Chi 2,P115,Trần Ngọc Thư,Nguyễn Thị Chân,,,Con ông Thư (Trang 28)
P130,Phanxico,Trần Ngọc Kỳ,8,Chi 2,P122,Trần Ngọc Thìu,,,Mất năm 200.,Con ông Thìu
P131,,Trần Thị Mừng,8,Chi 2,P122,Trần Ngọc Thìu,,,,Con ông Thìu
P132,,Trần Ngọc Trường,8,Chi 2,P122,Trần Ngọc Thìu,,,,Con ông Thìu
P133,,Trần Ngọc Chung (Bảo),8,Chi 2,P129,Trần Ngọc Bắc,-,,Chết sớm,Con ông Bắc
P136,,Trần Thị Thô,6,Chi 2,P114,Trần Ngọc Đềnh,,,,Con cụ Đềnh (Trang 30)
P137,,Trần Ngọc Kim,6,Chi 2,P114,Trần Ngọc Đềnh,-,,Chết sớm,Con cụ Đềnh
P138,,Trần Thị Thủ,5,Chi 2,P010,Trần Ngọc Chán,Vũ Đình Do,,,Con cụ Chán (Trang 31)
P139,,Trần Thị ...,5,Chi 2,P010,Trần Ngọc Chán,Trần Văn Khoang,,,Con cụ Chán
P138_1,,Vũ Đình Giáp,6,Chi 2,P138,Trần Thị Thủ,Vũ Thị Tẹo,,,Con ông Vũ Đình Do & Cụ Trần Thị Thủ
P138_2,,Vũ Đình Lý,6,Chi 2,P138,Trần Thị Thủ,Sinh; Hội,,,Con ông Vũ Đình Do & Cụ Trần Thị Thủ
P140,,Nguyễn Thị Gái,5,Chi 2,P011,Trần Thị Dịch,,,,Con cụ Dịch (Trang 32)
P141,,Nguyễn Thị ...,5,Chi 2,P011,Trần Thị Dịch,Nguyễn Văn Chấm,,,Con cụ Dịch"""

def infer_gender(name, christian_name, spouse):
    name_lower = name.lower()
    if 'thị' in name_lower or 'châu' in name_lower or 'nhị' in name_lower:
        return 'Nữ'
    if christian_name in ['Maria', 'Anna', 'Têrêxa', 'Vivian']:
        return 'Nữ'
    if 'văn' in name_lower or 'ngọc' in name_lower or 'hữu' in name_lower or 'đình' in name_lower or 'duy' in name_lower or 'quang' in name_lower:
        return 'Nam'
    if christian_name in ['Giuse', 'Phanxico', 'Gioan', 'Phaolo']:
        return 'Nam'
    return 'Nam'

def infer_branch_type(name, note):
    if name.startswith('Trần Ngọc'):
        return 'Nội tộc (Trực hệ)'
    elif name.startswith('Trần Thị'):
        return 'Nội tộc (Con gái)'
    elif 'Cháu ngoại' in note or 'họ Mai' in note or 'họ Ngô' in note or 'họ Phạm' in note or 'họ Vũ' in note or 'họ Đỗ' in note or 'họ Nguyễn' in note:
        return 'Ngoại tộc (Cháu ngoại)'
    elif not name.startswith('Trần '):
        return 'Ngoại tộc (Cháu ngoại)'
    return 'Nội tộc'

def infer_status(death_info, note, gen):
    if death_info and any(w in death_info.lower() for w in ['chết', 'mất', '199', '200', '197', '195', '194']):
        if 'sớm' in death_info.lower() or 'nhỏ' in death_info.lower():
            return 'Mất sớm'
        return 'Đã mất'
    if 'đã chết' in note.lower() or 'chết sớm' in note.lower() or 'ốm chết' in note.lower():
        if 'sớm' in note.lower() or 'nhỏ' in note.lower():
            return 'Mất sớm'
        return 'Đã mất'
    try:
        g = int(gen)
        if g <= 4:
            return 'Đã mất'
    except:
        pass
    return 'Còn sống'

def infer_role(id_code, name, note):
    if 'ĐÍCH TÔN' in note:
        return 'Đích Tôn'
    if 'Thủy Tổ' in note or id_code == 'P001':
        return 'Thủy Tổ'
    if 'Trưởng Chi' in note:
        return 'Trưởng Chi'
    if 'Tu sỹ' in note:
        return 'Tu sỹ'
    if 'Lập tự' in note:
        return 'Lập tự'
    return 'Thành viên'

def parse_data():
    lines = RAW_DATA.strip().split('\n')
    header = lines[0].split(',')
    rows = []
    for line in lines[1:]:
        # Parse CSV line respecting quotes
        import csv
        reader = csv.reader([line])
        parts = next(reader)
        if len(parts) < 11:
            parts += [''] * (11 - len(parts))
        
        p_id = parts[0].strip()
        c_name = parts[1].strip()
        full_name = parts[2].strip()
        gen = parts[3].strip()
        branch = parts[4].strip()
        p_parent_id = parts[5].strip()
        p_parent_name = parts[6].strip()
        spouse = parts[7].strip()
        b_date = parts[8].strip()
        d_date = parts[9].strip()
        notes = parts[10].strip()
        
        gender = infer_gender(full_name, c_name, spouse)
        branch_type = infer_branch_type(full_name, notes)
        status = infer_status(d_date, notes, gen)
        role = infer_role(p_id, full_name, notes)
        
        rows.append({
            'id': p_id,
            'christian_name': c_name,
            'full_name': full_name,
            'gender': gender,
            'generation': gen,
            'branch': branch,
            'branch_type': branch_type,
            'parent_id': p_parent_id,
            'parent_name': p_parent_name,
            'spouse': spouse,
            'birth_date': b_date,
            'death_date': d_date,
            'status': status,
            'role': role,
            'notes': notes
        })
    return rows

def generate_csv(rows, output_path):
    import csv
    headers = [
        'Mã ID',
        'Tên Thánh (Pháp Danh)',
        'Họ và Tên',
        'Giới Tính',
        'Thế Hệ (Đời)',
        'Chi / Ngành',
        'Nhánh Nội / Ngoại',
        'Mã ID Cha/Mẹ',
        'Tên Cha/Mẹ',
        'Vợ / Chồng / Phối Ngẫu',
        'Ngày/Năm Sinh',
        'Ngày/Năm Mất (Giỗ AL)',
        'Trạng Thái',
        'Vai Trò Dòng Họ',
        'Ghi Chú Chi Tiết & Con Cháu'
    ]
    with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for r in rows:
            writer.writerow([
                r['id'],
                r['christian_name'],
                r['full_name'],
                r['gender'],
                r['generation'],
                r['branch'],
                r['branch_type'],
                r['parent_id'],
                r['parent_name'],
                r['spouse'],
                r['birth_date'],
                r['death_date'],
                r['status'],
                r['role'],
                r['notes']
            ])

def escape_xml(s):
    if s is None:
        return ''
    return saxutils.escape(str(s))

def make_cell(col_idx, row_idx, value, style_id=0):
    col_letter = ""
    n = col_idx
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        col_letter = chr(65 + remainder) + col_letter
    cell_ref = f"{col_letter}{row_idx}"
    if value == "" or value is None:
        return ""
    # Check if number
    val_str = str(value).strip()
    if val_str.isdigit() and len(val_str) < 5 and not val_str.startswith('0'):
        return f'<c r="{cell_ref}" s="{style_id}"><v>{val_str}</v></c>'
    else:
        escaped = escape_xml(val_str)
        return f'<c r="{cell_ref}" t="inlineStr" s="{style_id}"><is><t xml:space="preserve">{escaped}</t></is></c>'

def build_worksheet_xml(headers, data_rows, col_widths=None):
    xml_parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
    xml_parts.append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
    
    # Auto-filter and sheetViews (freeze pane header row)
    xml_parts.append('''  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>''')
    
    # Column widths
    if col_widths:
        xml_parts.append('  <cols>')
        for idx, width in enumerate(col_widths, 1):
            xml_parts.append(f'    <col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>')
        xml_parts.append('  </cols>')
        
    xml_parts.append('  <sheetData>')
    
    # Header row (s=1: Header style)
    header_cells = []
    for c_idx, h in enumerate(headers, 1):
        header_cells.append(make_cell(c_idx, 1, h, style_id=1))
    xml_parts.append(f'    <row r="1" ht="28" customHeight="1">{"".join(header_cells)}</row>')
    
    # Data rows
    for r_idx, row in enumerate(data_rows, 2):
        row_style = 2 if (r_idx % 2 == 0) else 0
        row_cells = []
        for c_idx, val in enumerate(row, 1):
            # Special highlighting for special roles or header-like columns
            c_style = row_style
            if c_idx == 1: # Mã ID
                c_style = 3 # Bold ID style
            row_cells.append(make_cell(c_idx, r_idx, val, style_id=c_style))
        xml_parts.append(f'    <row r="{r_idx}" ht="20" customHeight="1">{"".join(row_cells)}</row>')
        
    xml_parts.append('  </sheetData>')
    
    # Auto filter range
    last_col_letter = ""
    n = len(headers)
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        last_col_letter = chr(65 + remainder) + last_col_letter
    total_rows = len(data_rows) + 1
    xml_parts.append(f'  <autoFilter ref="A1:{last_col_letter}{total_rows}"/>')
    
    xml_parts.append('</worksheet>')
    return '\n'.join(xml_parts)

def build_styles_xml():
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10.5"/><name val="Segoe UI"/><color rgb="FF1F2937"/></font>
    <font><b/><sz val="11"/><name val="Segoe UI"/><color rgb="FFFFFFFF"/></font>
    <font><sz val="10.5"/><name val="Segoe UI"/><color rgb="FF1F2937"/></font>
    <font><b/><sz val="10.5"/><name val="Segoe UI"/><color rgb="FF1E3A8A"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill> <!-- 2: Navy Header -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill> <!-- 3: Zebra light blue-gray -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/></patternFill></fill> <!-- 4: Amber highlight -->
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="5">
    <!-- 0: Standard body cell -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1">
      <alignment vertical="center"/>
    </xf>
    <!-- 1: Header row (Navy, white text, bold) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 2: Zebra row (light gray) -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1">
      <alignment vertical="center"/>
    </xf>
    <!-- 3: Bold ID cell -->
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 4: Highlight Amber -->
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1">
      <alignment vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>'''

def generate_xlsx(output_path, sheets):
    """
    sheets: list of dicts:
      {
        'title': str,
        'headers': list of str,
        'rows': list of lists,
        'widths': list of float
      }
    """
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # [Content_Types].xml
        sheet_overrides = []
        for i in range(1, len(sheets) + 1):
            sheet_overrides.append(f'  <Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
        content_types = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
{chr(10).join(sheet_overrides)}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>'''
        zf.writestr('[Content_Types].xml', content_types)

        # _rels/.rels
        zf.writestr('_rels/.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>''')

        # xl/_rels/workbook.xml.rels
        wb_rels = []
        for i in range(1, len(sheets) + 1):
            wb_rels.append(f'  <Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>')
        wb_rels.append(f'  <Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>')
        zf.writestr('xl/_rels/workbook.xml.rels', f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
{chr(10).join(wb_rels)}
</Relationships>''')

        # xl/workbook.xml
        sheet_tags = []
        for i, s in enumerate(sheets, 1):
            sheet_tags.append(f'    <sheet name="{escape_xml(s["title"])}" sheetId="{i}" r:id="rId{i}"/>')
        zf.writestr('xl/workbook.xml', f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
{chr(10).join(sheet_tags)}
  </sheets>
</workbook>''')

        # xl/styles.xml
        zf.writestr('xl/styles.xml', build_styles_xml())

        # Worksheets
        for i, s in enumerate(sheets, 1):
            sheet_xml = build_worksheet_xml(s['headers'], s['rows'], s.get('widths'))
            zf.writestr(f'xl/worksheets/sheet{i}.xml', sheet_xml)

def main():
    rows = parse_data()
    print(f"Parsed {len(rows)} members successfully!")
    
    # 1. Sheet 1: Danh_Sach_Gia_Pha_Day_Du (Full 148+ members from sample)
    headers_sheet1 = [
        'Mã ID',
        'Tên Thánh (Pháp Danh)',
        'Họ và Tên',
        'Giới Tính',
        'Thế Hệ (Đời)',
        'Chi / Ngành',
        'Nhánh Nội / Ngoại',
        'Mã ID Cha/Mẹ',
        'Tên Cha/Mẹ',
        'Vợ / Chồng / Phối Ngẫu',
        'Ngày/Năm Sinh',
        'Ngày/Năm Mất (Giỗ AL)',
        'Trạng Thái',
        'Vai Trò Dòng Họ',
        'Ghi Chú Chi Tiết & Con Cháu'
    ]
    widths_sheet1 = [12, 18, 26, 12, 14, 15, 22, 15, 24, 28, 16, 22, 14, 18, 42]
    
    data_rows_sheet1 = []
    for r in rows:
        data_rows_sheet1.append([
            r['id'],
            r['christian_name'],
            r['full_name'],
            r['gender'],
            r['generation'],
            r['branch'],
            r['branch_type'],
            r['parent_id'],
            r['parent_name'],
            r['spouse'],
            r['birth_date'],
            r['death_date'],
            r['status'],
            r['role'],
            r['notes']
        ])
        
    # 2. Sheet 2: Mau_Nhap_Lieu_Moi (Empty Template with example rows)
    example_rows = [
        ['P001', '', 'Nguyễn Văn Cụ Tổ', 'Nam', '1', 'Đại Tộc', 'Nội tộc (Trực hệ)', '-', 'Thủy Tổ', 'Trần Thị Cụ Bà', '1890', 'Mất 15/07 Âm', 'Đã mất', 'Thủy Tổ', 'Cụ khởi lập chi nhánh dòng họ'],
        ['P002', 'Giuse', 'Nguyễn Văn Trưởng', 'Nam', '2', 'Chi 1 (Chi Trưởng)', 'Nội tộc (Trực hệ)', 'P001', 'Nguyễn Văn Cụ Tổ', 'Lê Thị Dâu Cả', '1920', 'Mất 02/03 Âm', 'Đã mất', 'Trưởng Chi', 'Trưởng nam Đời 2'],
        ['P003', '', 'Nguyễn Thị Cả', 'Nữ', '2', 'Chi 1 (Chi Trưởng)', 'Nội tộc (Con gái)', 'P001', 'Nguyễn Văn Cụ Tổ', 'Phạm Văn Rể', '1923', 'Đã mất', 'Đã mất', 'Con gái xuất giá', 'Con gái đầu cụ tổ'],
        ['P003_1', '', 'Phạm Văn Cháu Ngoại', 'Nam', '3', 'Chi 1 (Chi Trưởng)', 'Ngoại tộc (Cháu ngoại)', 'P003', 'Nguyễn Thị Cả', 'Hoàng Thị Thảo', '1955', '', 'Còn sống', 'Thành viên', 'Cháu ngoại cụ tổ'],
        ['P004', 'Phanxico', 'Nguyễn Văn Đích Tôn', 'Nam', '3', 'Chi 1 (Chi Trưởng)', 'Nội tộc (Trực hệ)', 'P002', 'Nguyễn Văn Trưởng', 'Trần Thị Hoa', '1950', '', 'Còn sống', 'Đích Tôn', 'Đích tôn dòng họ']
    ]
    
    # 3. Sheet 3: Tong_Quan_Va_Thong_Ke
    headers_sheet3 = [
        'Thế Hệ (Đời)',
        'Tổng Số Thành Viên',
        'Chi 1 (Thượng Chi)',
        'Chi 2 (Hạ Chi)',
        'Nam Giới',
        'Nữ Giới',
        'Ngoại Tộc (Cháu Ngoại)',
        'Ghi Chú Đặc Điểm Thế Hệ'
    ]
    widths_sheet3 = [16, 20, 20, 20, 15, 15, 24, 45]
    data_rows_sheet3 = [
        ['Đời 1', '1', '1', '0', '1', '0', '0', 'Thủy tổ Cố Trần Ngọc Truyền (Khởi đầu Ngành II Công Giáo)'],
        ['Đời 2', '1', '1', '0', '1', '0', '0', 'Cố Trần Ngọc Toại (Con nối dõi cụ Truyền)'],
        ['Đời 3', '2', '1', '1', '2', '0', '0', 'Cụ Trần Ngọc Thanh (Chi 1 - Thượng Chi) & Cụ Trần Ngọc Phúc (Chi 2 - Hạ Chi)'],
        ['Đời 4', '7', '3', '4', '6', '1', '0', 'Chi 1: 3 người; Chi 2: 4 người (Bao gồm cụ bà Trần Thị Dịch)'],
        ['Đời 5', '26', '17', '9', '14', '12', '0', 'Các con của Đời 4 ở cả 2 Chi'],
        ['Đời 6', '82', '49', '33', '44', '38', '24', 'Thế hệ 6 bao gồm nhiều cháu ngoại họ Trần Hữu, Mai, Ngô, Phạm, Vũ, Đỗ, Nguyễn'],
        ['Đời 7', '58', '29', '29', '28', '30', '26', 'Thế hệ 7 con của các con gái Chi 1 & Chi 2'],
        ['Đời 8', '41', '26', '15', '23', '18', '19', 'Thế hệ trẻ, bao gồm các Đích tôn Trần Ngọc Bắc, Long, Minh, Khoa...'],
        ['TỔNG CỘNG', '218', '127', '91', '119', '99', '69', 'Toàn bộ thành viên nội & ngoại số hoá từ 31 trang tài liệu gia phả']
    ]
    
    # 4. Sheet 4: Huong_Dan_Quy_Chuan
    headers_sheet4 = [
        'Tên Trường (Cột)',
        'Bắt Buộc',
        'Kiểu Dữ Liệu',
        'Quy Chuẩn Định Dạng',
        'Ý Nghĩa & Ví Dụ Chi Tiết'
    ]
    widths_sheet4 = [22, 14, 16, 32, 55]
    data_rows_sheet4 = [
        ['Mã ID', 'CÓ', 'Chuỗi ký tự', 'Không dấu, không khoảng trắng', 'Mã duy nhất định danh mỗi người: P001, P002, hoặc dạng phân cấp P012_1, P012_2 cho cháu ngoại'],
        ['Tên Thánh (Pháp Danh)', 'KHÔNG', 'Chuỗi ký tự', 'Viết hoa chữ cái đầu', 'Tên thánh rửa tội (Công Giáo: Giuse, Maria, Phanxico, Anna, Têrêxa...) hoặc Pháp danh Phật Giáo'],
        ['Họ và Tên', 'CÓ', 'Chuỗi ký tự', 'Tiếng Việt có dấu đầy đủ', 'Họ tên đầy đủ của thành viên. Nếu chưa rõ tên có thể ghi: Trần Thị ... (Con thứ 1)'],
        ['Giới Tính', 'CÓ', 'Lựa chọn', 'Nam hoặc Nữ', 'Phân loại giới tính phục vụ vẽ màu sắc node và thuật toán phân nhánh trên Canvas'],
        ['Thế Hệ (Đời)', 'CÓ', 'Số nguyên', '1, 2, 3, 4, 5, 6, 7, 8...', 'Bậc thế hệ tính từ Đời 1 (Thủy tổ / Cụ khởi đầu gia phả)'],
        ['Chi / Ngành', 'KHÔNG', 'Chuỗi ký tự', 'Chi 1, Chi 2, Ngành II...', 'Phân nhánh chi họ lớn để gom nhóm và lọc hiển thị trên website'],
        ['Nhánh Nội / Ngoại', 'KHÔNG', 'Lựa chọn', 'Nội tộc (Trực hệ) / Ngoại tộc (Cháu ngoại)', 'Phân biệt con cháu mang họ chính của dòng tộc hay là cháu ngoại (con của các con gái xuất giá)'],
        ['Mã ID Cha/Mẹ', 'KHÔNG', 'Chuỗi ký tự', 'Phải khớp với 1 Mã ID đã có', 'ID của Cha hoặc Mẹ ruột trong dòng họ. Để trống hoặc ghi dấu "-" nếu là Cụ Tổ Đời 1'],
        ['Tên Cha/Mẹ', 'KHÔNG', 'Chuỗi ký tự', 'Ghi rõ tên để đối chiếu', 'Tên Cha/Mẹ để người nhập liệu dễ nhìn và rà soát mà không cần tra ngược ID'],
        ['Vợ / Chồng / Phối Ngẫu', 'KHÔNG', 'Chuỗi ký tự', 'Nhiều vợ/chồng cách nhau bởi dấu chấm phẩy', 'Ví dụ: "Bà cả; Bà hai" hoặc "Maria Trần Thị Thục (SN 1955)"'],
        ['Ngày/Năm Sinh', 'KHÔNG', 'Ngày hoặc Chuỗi', 'DD/MM/YYYY hoặc SN YYYY', 'Ví dụ: 23/04/1954 hoặc SN 1928'],
        ['Ngày/Năm Mất (Giỗ AL)', 'KHÔNG', 'Chuỗi ký tự', 'Ghi rõ ngày Âm lịch nếu có', 'Ví dụ: Mất 15/08/1998 Âm, Mất 21/3, hoặc Ốm chết từ nhỏ, Đã chết'],
        ['Trạng Thái', 'KHÔNG', 'Lựa chọn', 'Còn sống / Đã mất / Mất sớm', 'Mặc định là Còn sống nếu không có ghi chú mất'],
        ['Vai Trò Dòng Họ', 'KHÔNG', 'Chuỗi ký tự', 'Thủy Tổ / Đích Tôn / Trưởng Chi / Tu sỹ', 'Dùng để hiển thị badge huy hiệu danh giá trên node gia phả'],
        ['Ghi Chú Chi Tiết & Con Cháu', 'KHÔNG', 'Chuỗi ký tự', 'Ghi chú tự do', 'Số lượng con cái (trai/gái), số cháu nội/ngoại, tư liệu trang sách gia phả gốc']
    ]
    
    workspace_dir = "/Users/kitatran/Documents/Kita/Source/giapha_online"
    xlsx_path = os.path.join(workspace_dir, "genealogy_template.xlsx")
    csv_path = os.path.join(workspace_dir, "Danh_Sach_Gia_Pha_Day_Du.csv")
    
    # Generate CSV
    generate_csv(rows, csv_path)
    print(f"Generated CSV at {csv_path}")
    
    # Generate Multi-sheet XLSX
    sheets = [
        {
            'title': 'Danh_Sach_Gia_Pha_Day_Du',
            'headers': headers_sheet1,
            'rows': data_rows_sheet1,
            'widths': widths_sheet1
        },
        {
            'title': 'Mau_Nhap_Lieu_Moi',
            'headers': headers_sheet1,
            'rows': example_rows,
            'widths': widths_sheet1
        },
        {
            'title': 'Tong_Quan_Va_Thong_Ke',
            'headers': headers_sheet3,
            'rows': data_rows_sheet3,
            'widths': widths_sheet3
        },
        {
            'title': 'Huong_Dan_Quy_Chuan',
            'headers': headers_sheet4,
            'rows': data_rows_sheet4,
            'widths': widths_sheet4
        }
    ]
    
    generate_xlsx(xlsx_path, sheets)
    print(f"Generated Multi-sheet XLSX successfully at {xlsx_path}")

if __name__ == '__main__':
    main()
