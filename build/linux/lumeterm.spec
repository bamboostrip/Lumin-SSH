# RPM 构建规格：LumeTerm
# 由 CI 用 rpmbuild 原生构建，不依赖 alien 转换。
# CI 把 VERSION 按 rpm 规则拆成 lum_version / lum_release 注入。

Name:           lumeterm
Version:        %{lum_version}
Release:        %{lum_release}%{?dist}
Summary:        Lightweight Terminal Client
License:        proprietary
URL:            https://github.com/wmwlwmwl/LumeTerm
Packager:       LumeTerm <admin@662662.xyz>
# rpm 依赖用较通用的包名（覆盖 Fedora/openSUSE 等）。
# v3 (Wails v3) Linux 默认走 GTK4 + WebKitGTK 6.0 后端，托盘经 D-Bus 直连
# StatusNotifier，不再链接 libayatana-appindicator。
Requires:       gtk4
Requires:       webkitgtk6.0
Requires:       glib2
BuildArch:      x86_64

%description
A modern, lightweight terminal client built with Wails.
Quickly manage and connect to your SSH servers.

%install
install -D -m 0755 %{_sourcedir}/LumeTerm %{buildroot}%{_bindir}/lumeterm
install -D -m 0644 %{_sourcedir}/appicon.png %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/lumeterm.png
install -D -m 0644 %{_sourcedir}/lumeterm.desktop %{buildroot}%{_datadir}/applications/lumeterm.desktop

%files
%{_bindir}/lumeterm
%{_datadir}/icons/hicolor/256x256/apps/lumeterm.png
%{_datadir}/applications/lumeterm.desktop

# 等价于 deb 的 postinst：安装后刷新桌面数据库与图标缓存
%post
update-desktop-database -q %{_datadir}/applications || :
gtk-update-icon-cache -q %{_datadir}/icons/hicolor || :

# 等价于 deb 的 postrm：卸载后刷新
%postun
update-desktop-database -q %{_datadir}/applications || :
gtk-update-icon-cache -q %{_datadir}/icons/hicolor || :

%changelog
* Sun Sep 20 2026 LumeTerm <admin@662662.xyz> - 1.4.0-1
- Rename Lumin to LumeTerm (package, binary, desktop entry and icon).

* Thu Aug 7 2026 Lumin <admin@662662.xyz> - 1.0.0-1
- Initial RPM build via rpmbuild (replaces alien conversion).
