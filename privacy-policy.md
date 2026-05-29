---
layout: default
title: Privacy Policy — CLASS Calendar
---

Last Updated: May 30, 2026 / 最終更新日: 2026年5月30日

---

## English

### Overview

CLASS Calendar is a Chrome extension that retrieves timetable data from Tokyo University of Science's CLASS portal and registers the schedule as events in the user's Google Calendar.

This privacy policy explains how the extension handles Google user data in compliance with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

---

### 1. Data Accessed

The extension requests the following Google OAuth 2.0 scope:

| Scope                                      | Purpose                                                       |
|--------------------------------------------|---------------------------------------------------------------|
| `https://www.googleapis.com/auth/calendar` | Creating, reading, and deleting calendar events and calendars |

**Specific Google user data accessed:**

- **Calendar list** — To check whether a calendar named "CLASS時間割" already exists, avoiding duplicate creation.
- **Events within the "CLASS時間割" calendar only** — To check for duplicate events before registration and to delete previously registered events when the user requests removal.

The extension does **not** access, read, or store any data from calendars or events other than those it creates in "CLASS時間割".

---

### 2. Data Usage

Google user data is used **solely** for the following purposes:

| Operation          | Google Data Used        | Purpose                                                            |
|--------------------|-------------------------|--------------------------------------------------------------------|
| Calendar creation  | Calendar list           | Create "CLASS時間割" calendar if it does not already exist         |
| Event registration | Events in "CLASS時間割" | Register timetable events; check for duplicates before inserting   |
| Event deletion     | Events in "CLASS時間割" | Delete previously registered events at the user's explicit request |

The extension does **not** use Google user data for:

- Advertising or analytics
- Training AI/ML models
- Sharing with or selling to third parties
- Any purpose beyond the core calendar-sync functionality described above

---

### 3. Data Sharing

**The extension does not share any Google user data with third parties.**

Google user data is never transferred to the developer's servers, analytics services, advertising networks, or any other external service. The only network requests made by the extension are:

- **Google Calendar API** (`googleapis.com`) — To perform the calendar operations described in Section 2.
- **CLASS portal** (`class.admin.tus.ac.jp`) — To fetch the user's timetable data. No Google user data is sent to this server.

---

### 4. Data Storage & Protection

| Data                                            | Storage Location                          | Notes                                                             |
|-------------------------------------------------|-------------------------------------------|-------------------------------------------------------------------|
| Google OAuth access token                       | Browser memory only                       | Cleared when popup is closed; never written to disk or any server |
| Timetable data (course name, classroom, period) | Browser memory only                       | Cleared when popup is closed                                      |
| "CLASS時間割" calendar ID                       | Chrome `localStorage` (device-local only) | Never sent to external servers                                    |
| Semester start/end dates                        | Chrome `localStorage` (device-local only) | Saved for user convenience; never sent externally                 |
| Event color and notification settings           | Chrome `localStorage` (device-local only) | Saved for user convenience; never sent externally                 |

The developer operates **no external servers** that store or process Google user data. All Google user data remains on the user's device and is transmitted only to Google's own APIs over HTTPS.

---

### 5. Data Retention & Deletion

#### Retention

- **OAuth access token**: Retained in browser memory only while the popup is open. Automatically cleared when the popup is closed.
- **Timetable data**: Retained in browser memory only while the popup is open.
- **Device-local settings**: Retained in `localStorage` until the extension is uninstalled or the user manually clears browser storage.

#### Deletion

Users can delete their data at any time through the following methods:

1. **Revoke Google account access** — Visit [Google Account Permissions](https://myaccount.google.com/permissions) and remove "CLASS Calendar". This immediately revokes the OAuth token.
2. **Delete registered events** — Use the extension's built-in deletion feature to remove all events from the "CLASS時間割" calendar.
3. **Delete the calendar** — Remove the "CLASS時間割" calendar directly from Google Calendar to delete all associated events.
4. **Uninstall the extension** — All `localStorage` data is removed automatically upon uninstallation.

---

### 6. Google API Services

CLASS Calendar's use of Google Calendar data is limited to the purposes described in this policy and complies with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

---

### 7. Changes to This Policy

If this policy is updated in a material way, the "Last Updated" date at the top of this page will be revised. Continued use of the extension after a policy update constitutes acceptance of the revised policy.

---

### 8. Contact

For questions or data deletion requests, please contact:

- Email: [m.kobayashi@noraly-clary.com](mailto:m.kobayashi@noraly-clary.com)
- GitHub Issues: [NoralyClary-PUBLIC Issues](https://github.com/vaio18note-dotcom/NoralyClary-PUBLIC/issues)

---
---

## 日本語

### 概要

CLASS Calendar は、東京理科大学の CLASS ポータルから時間割データを取得し、ユーザーの Google カレンダーにイベントとして登録する Chrome 拡張機能です。

本プライバシーポリシーは、[Google API サービスユーザーデータポリシー](https://developers.google.com/terms/api-services-user-data-policy)に準拠し、Google ユーザーデータの取り扱いを説明します。

---

### 1. アクセスするデータ

本拡張機能は以下の Google OAuth 2.0 スコープを要求します。

| スコープ                                   | 目的                                       |
|--------------------------------------------|--------------------------------------------|
| `https://www.googleapis.com/auth/calendar` | カレンダー・イベントの作成・読み取り・削除 |

**アクセスする具体的な Google ユーザーデータ:**

- **カレンダー一覧** — 「CLASS時間割」カレンダーの重複作成を防ぐために確認します。
- **「CLASS時間割」カレンダー内のイベントのみ** — 登録前の重複確認、およびユーザーが削除操作を行う際に使用します。

本拡張機能は「CLASS時間割」以外のカレンダーやイベントの内容を取得・閲覧・保存しません。

---

### 2. データの使用目的

Google ユーザーデータは、以下の目的**のみ**に使用されます。

<!-- markdownlint-disable MD060 -->
| 操作 | 使用するGoogleデータ | 目的 |
|------|---------------------|------|
| カレンダー作成 | カレンダー一覧 | 「CLASS時間割」が存在しない場合に初回作成 |
| イベント登録 | 「CLASS時間割」内のイベント | 時間割イベントの登録・登録前の重複確認 |
| イベント削除 | 「CLASS時間割」内のイベント | ユーザーの明示的な操作による登録済みイベントの削除 |
<!-- markdownlint-enable MD060 -->

Google ユーザーデータは以下の目的には**一切使用しません**。

- 広告または分析
- AI/ML モデルの学習
- 第三者への共有または販売
- 上記のカレンダー同期機能以外のあらゆる目的

---

### 3. データの共有

**本拡張機能は、いかなる第三者にも Google ユーザーデータを共有しません。**

Google ユーザーデータは開発者のサーバー、分析サービス、広告ネットワーク、その他の外部サービスには一切送信されません。本拡張機能が行う外部への通信は以下の2つのみです。

- **Google カレンダー API**（`googleapis.com`）— 第2節に記載のカレンダー操作のため
- **CLASS ポータル**（`class.admin.tus.ac.jp`）— 時間割データの取得のため（ここには Google ユーザーデータは送信されません）

---

### 4. データの保存とセキュリティ

<!-- markdownlint-disable MD060 -->
| データ | 保存場所 | 備考 |
|--------|----------|------|
| Google OAuth アクセストークン | ブラウザのメモリのみ | ポップアップを閉じると消去。ディスクや外部サーバーには保存しない |
| 時間割データ（授業名・教室・時限） | ブラウザのメモリのみ | ポップアップを閉じると消去 |
| 「CLASS時間割」カレンダーの ID | Chrome `localStorage`（端末内のみ） | 外部サーバーには送信しない |
| 学期の開始日・終了日 | Chrome `localStorage`（端末内のみ） | 入力省略のために保存。外部には送信しない |
| イベントの色・通知タイミング設定 | Chrome `localStorage`（端末内のみ） | 設定復元のために保存。外部には送信しない |
<!-- markdownlint-enable MD060 -->

開発者は Google ユーザーデータを保存・処理する**外部サーバーを一切運営しておりません**。すべての Google ユーザーデータはユーザーの端末上にのみ存在し、HTTPS 経由で Google 自身の API にのみ送信されます。

---

### 5. データの保持と削除

#### 保持期間

- **OAuth アクセストークン**: ポップアップが開いている間のみブラウザのメモリに保持。ポップアップを閉じると自動的に消去されます。
- **時間割データ**: ポップアップが開いている間のみブラウザのメモリに保持。
- **端末内設定**: 拡張機能のアンインストール、またはユーザーが手動でブラウザストレージを削除するまで `localStorage` に保持されます。

#### 削除方法

ユーザーはいつでも以下の方法でデータを削除できます。

1. **Google アカウントのアクセスを取り消す** — [Google アカウントの権限ページ](https://myaccount.google.com/permissions) から「CLASS Calendar」を削除（OAuth トークンを即時失効）
2. **登録済みイベントを削除する** — 拡張機能の削除機能を使い、「CLASS時間割」カレンダーのすべてのイベントを削除
3. **カレンダーを削除する** — Google カレンダーから「CLASS時間割」カレンダーを直接削除
4. **拡張機能をアンインストールする** — Chrome 拡張機能を削除すると、`localStorage` のデータが自動的に消去されます

---

### 6. Google API サービスの利用

本拡張機能の Google カレンダーデータの利用は、本ポリシーに記載された目的に限定され、Limited Use 要件を含む [Google API サービスユーザーデータポリシー](https://developers.google.com/terms/api-services-user-data-policy)に準拠しています。

---

### 7. ポリシーの変更

本ポリシーに重要な変更を行う場合は、ページ上部の「最終更新日」を改訂します。変更後も引き続き本拡張機能をご利用いただくことで、改訂後のポリシーに同意したものとみなします。

---

### 8. お問い合わせ

ご不明な点やデータ削除のご要望は、以下の方法でご連絡ください。

- メール: [m.kobayashi@noraly-clary.com](mailto:m.kobayashi@noraly-clary.com)
- GitHub Issues: [NoralyClary-PUBLIC Issues](https://github.com/vaio18note-dotcom/NoralyClary-PUBLIC/issues)
